#!/usr/bin/env python3
"""Bounded QLoRA feasibility probe: GPU 1 only; no deployment or full training.

Uses complete training examples, never evaluation cases, and computes CE only
on shifted assistant tokens. No prompt/answer truncation. Selective logits avoid
allocating vocabulary logits for ignored prompt positions (same causal loss).
"""
import os
GPU='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
os.environ['CUDA_VISIBLE_DEVICES']=GPU
os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import argparse,json,time,hashlib,subprocess,traceback
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);a=p.parse_args()
root=a.work;root.mkdir(exist_ok=True,parents=True);log=root/'smoke-events.jsonl'
def event(stage,**kw):
    value={'stage':stage,'unix_time':time.time(),**kw}
    with log.open('a') as f:f.write(json.dumps(value,ensure_ascii=False)+'\n')
    print(json.dumps(value,ensure_ascii=False),flush=True)
def smi():
    return subprocess.check_output(['nvidia-smi','--query-gpu=index,uuid,memory.used,memory.free','--format=csv,noheader,nounits'],text=True).strip()
started=time.monotonic();report={'status':'started','gpu_uuid':GPU,'rank':8,'batch_size':1,'gradient_checkpointing':True,
    'quantization':'NF4 double quantization','compute_dtype':'float16','max_sequence_length':4096,'steps':[],
    'deployment':False,'full_training':False,'eval_examples_used_for_training':False}
try:
    import torch
    from transformers import AutoTokenizer,Qwen3_5ForConditionalGeneration,BitsAndBytesConfig
    from peft import LoraConfig,get_peft_model
    assert torch.cuda.device_count()==1,'MORE_THAN_ONE_GPU_VISIBLE'
    prop=torch.cuda.get_device_properties(0)
    report.update(torch=torch.__version__,cuda=torch.version.cuda,compute_capability=list(torch.cuda.get_device_capability(0)),gpu_name=prop.name)
    assert prop.name=='NVIDIA TITAN RTX'
    free,total=torch.cuda.mem_get_info()
    if free<22*1024**3:raise RuntimeError('GPU_1_HAS_LESS_THAN_22_GIB_FREE')
    event('gpu_checked',**report,nvidia_smi=smi())
    torch.manual_seed(240924)
    checkpoint=Path((root/'checkpoint-path.txt').read_text().strip())
    report['checkpoint']=str(checkpoint)
    expected=json.loads((root/'native-verification.json').read_text())['sha256']['train.candidate.jsonl']
    assert hashlib.sha256((root/'train.candidate.jsonl').read_bytes()).hexdigest()==expected
    report['train_sha256']=expected
    # Validate pinned metadata against the locally audited official revision.
    meta=json.loads((root/'model-provenance.json').read_text())
    for f in meta['files']:
        if hashlib.sha256((checkpoint/f['file']).read_bytes()).hexdigest()!=f['sha256']:raise RuntimeError('CHECKPOINT_METADATA_HASH_MISMATCH:'+f['file'])
    assert hashlib.sha256((checkpoint/'tokenizer.json').read_bytes()).hexdigest()=='5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42'
    tokenizer=AutoTokenizer.from_pretrained(checkpoint,local_files_only=True,trust_remote_code=False)
    rows=[json.loads(s) for s in (root/'train.candidate.jsonl').read_text().splitlines()]
    assert len(rows)==60 and all(r['split']=='train' for r in rows)
    samples=[]
    for r in rows:
        messages=r['messages']
        prompt=tokenizer.apply_chat_template(messages[:2],tokenize=False,add_generation_prompt=True,enable_thinking=False)
        full=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=False,enable_thinking=False)
        assert full.startswith(prompt)
        ids=tokenizer.encode(full,add_special_tokens=False);prefix=tokenizer.encode(prompt,add_special_tokens=False)
        assert ids[:len(prefix)]==prefix and tokenizer.eos_token_id in ids[len(prefix):]
        assert len(ids)<=4096
        samples.append((len(ids),r['id'],ids,len(prefix),r['task']))
    # One profile and the longest complete session example, in that order.
    chosen=[max((s for s in samples if s[-1]=='profile_update'),key=lambda s:s[0]),
            max((s for s in samples if s[-1]=='session_analysis'),key=lambda s:s[0])]
    report['selected_examples']=[{'id':s[1],'total_tokens':s[0],'prompt_tokens':s[3]} for s in chosen]
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.float16)
    event('loading_model',selected_examples=report['selected_examples'])
    model=Qwen3_5ForConditionalGeneration.from_pretrained(checkpoint,local_files_only=True,trust_remote_code=False,
        quantization_config=quant,dtype=torch.float16,device_map={'':0},attn_implementation='sdpa',use_kernels=False)
    model.config.use_cache=False;model.config.text_config.use_cache=False
    # Same freeze/norm/GC protocol as PEFT, but avoid its transient FP32 cast
    # of the two 248320 x 5120 frozen embedding/head matrices (~4.74 GiB each).
    # Casting back after prepare_model_for_kbit_training is too late on 24 GiB.
    keep_half={id(model.get_input_embeddings().weight),id(model.get_output_embeddings().weight)}
    for name,param in model.named_parameters():
        param.requires_grad_(False)
        if param.dtype in (torch.float16,torch.bfloat16) and param.__class__.__name__!='Params4bit' and id(param) not in keep_half:
            param.data=param.data.to(torch.float32)
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
    torch.cuda.empty_cache()
    report['frozen_embedding_head_dtype']='float16_without_intermediate_fp32'
    modules=r'.*language_model\.layers\.\d+\.(?:self_attn\.(?:q_proj|k_proj|v_proj|o_proj)|linear_attn\.(?:in_proj_qkv|in_proj_z|in_proj_b|in_proj_a|out_proj)|mlp\.(?:gate_proj|up_proj|down_proj))'
    model=get_peft_model(model,LoraConfig(r=8,lora_alpha=16,lora_dropout=0.0,target_modules=modules,bias='none',task_type='CAUSAL_LM'))
    trainable=[p for p in model.parameters() if p.requires_grad]
    probe_weight=next(p for n,p in model.named_parameters() if p.requires_grad and '.lora_B.' in n)
    assert trainable and all('lora_' in n for n,p in model.named_parameters() if p.requires_grad)
    report['trainable_parameters']=sum(p.numel() for p in trainable)
    optimizer=torch.optim.AdamW(trainable,lr=1e-5)
    scaler=torch.amp.GradScaler('cuda',init_scale=256)
    model.train();torch.cuda.synchronize()
    event('model_loaded',allocated_mib=torch.cuda.memory_allocated()/1024**2,reserved_mib=torch.cuda.memory_reserved()/1024**2,
          trainable_parameters=report['trainable_parameters'],nvidia_smi=smi())
    for _,case,ids,boundary,task in chosen:
        torch.cuda.reset_peak_memory_stats();t=time.monotonic();optimizer.zero_grad(set_to_none=True)
        input_ids=torch.tensor([ids],device='cuda',dtype=torch.long)
        positions=torch.arange(boundary-1,len(ids)-1,device='cuda')
        targets=input_ids[:,boundary:]
        assert len(positions)==targets.numel() and len(positions)>0
        before=probe_weight.detach().clone()
        event('step_started',case=case,total_tokens=len(ids),loss_tokens=targets.numel())
        with torch.autocast('cuda',dtype=torch.float16):
            output=model(input_ids=input_ids,attention_mask=torch.ones_like(input_ids),use_cache=False,logits_to_keep=positions)
            logits=output.logits
            assert logits.shape[1]==targets.shape[1]
            loss=torch.nn.functional.cross_entropy(logits.float().reshape(-1,logits.shape[-1]),targets.reshape(-1))
        if not torch.isfinite(loss):raise RuntimeError('NONFINITE_LOSS')
        scaler.scale(loss).backward();scaler.unscale_(optimizer)
        grads=[p.grad for p in trainable if p.grad is not None]
        if not grads or not all(torch.isfinite(g).all().item() for g in grads):raise RuntimeError('NONFINITE_OR_MISSING_ADAPTER_GRADIENT')
        grad_norm=torch.nn.utils.clip_grad_norm_(trainable,1.0)
        if not torch.isfinite(grad_norm) or grad_norm.item()==0:raise RuntimeError('INVALID_ADAPTER_GRADIENT_NORM')
        scaler.step(optimizer);scaler.update();torch.cuda.synchronize()
        result={'case':case,'task':task,'tokens':len(ids),'loss_tokens':targets.numel(),'loss':loss.item(),
            'gradient_norm':grad_norm.item(),'step_seconds':time.monotonic()-t,
            'peak_allocated_mib':torch.cuda.max_memory_allocated()/1024**2,'peak_reserved_mib':torch.cuda.max_memory_reserved()/1024**2,
            'sample_adapter_changed':not torch.equal(before,probe_weight.detach())}
        if not result['sample_adapter_changed']:raise RuntimeError('ADAPTER_DID_NOT_UPDATE')
        report['steps'].append(result);event('step_finished',**result,nvidia_smi=smi())
        del output,logits,loss,input_ids,targets,positions,before
    model.save_pretrained(root/'probe-adapter-do-not-deploy',safe_serialization=True)
    report['status']='passed_two_full_example_steps'
except Exception as e:
    report.update(status='failed',error_type=type(e).__name__,error=str(e))
    (root/'smoke-traceback.txt').write_text(traceback.format_exc())
    event('failed',error_type=type(e).__name__,error=str(e))
finally:
    report['total_seconds']=time.monotonic()-started
    (root/'smoke-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    event('finished',status=report['status'],total_seconds=report['total_seconds'])
    if report['status'].startswith('failed'):raise SystemExit(1)
