"""Batch-one greedy cached decoding with explicit input-device attention masks.

Avoid GenerationMixin.model.device: the frozen first embedding can live on CPU.
No sampling, output repair, schema grammar, or answer truncation after decoding.
"""
import time
import torch

@torch.inference_mode()
def greedy_decode(model, input_ids, max_new_tokens, eos_token_ids, timeout_seconds=600):
    if input_ids.shape[0] != 1 or max_new_tokens < 1:
        raise ValueError('BATCH_ONE_AND_POSITIVE_LIMIT_REQUIRED')
    start=time.monotonic(); generated=[]; past=None; current=input_ids
    mask=torch.ones_like(input_ids); prefill=None; reason='length'
    for step in range(max_new_tokens):
        if time.monotonic()-start > timeout_seconds:
            reason='timeout'; break
        with torch.autocast('cuda',dtype=torch.float16):
            output=model(input_ids=current,attention_mask=mask,
                         past_key_values=past,use_cache=True,logits_to_keep=1)
        logits=output.logits[:,-1,:]
        if not torch.isfinite(logits).all():
            raise RuntimeError('NONFINITE_GENERATION_LOGITS')
        token=logits.argmax(dim=-1,keepdim=True)
        token_id=token.item(); generated.append(token_id)
        if step==0: prefill=time.monotonic()-start
        past=output.past_key_values
        if token_id in eos_token_ids:
            reason='eos'; break
        current=token
        mask=torch.cat((mask,torch.ones((1,1),device=input_ids.device,dtype=mask.dtype)),dim=1)
        del output,logits
    torch.cuda.synchronize()
    elapsed=time.monotonic()-start
    return {'token_ids':generated,'stop_reason':reason,'output_tokens':len(generated),
            'seconds':elapsed,'prefill_seconds':prefill,
            'decode_tokens_per_second':(len(generated)-1)/(elapsed-prefill)
               if prefill is not None and elapsed>prefill and len(generated)>1 else None}
