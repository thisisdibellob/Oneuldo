"""GPU 1 small cached decoding + PEFT save/reload before maintenance."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json,tempfile,torch
from pathlib import Path
from types import SimpleNamespace
from torch.nn.attention import sdpa_kernel,SDPBackend
from transformers import Qwen3_5TextConfig,Qwen3_5ForCausalLM,Qwen3_5Config,Qwen3_5VisionConfig,Qwen3_5ForConditionalGeneration
from peft import LoraConfig,get_peft_model,get_peft_model_state_dict,set_peft_model_state_dict
from safetensors.torch import load_file
import efficient_attention as attention
from frozen_embedding import offload_frozen_embedding
from decoding import greedy_decode
assert torch.cuda.device_count()==1
torch.manual_seed(240924);attention.register();results=[]
for length in [1,3]:
 q=torch.randn(1,4,length,32,device='cuda',dtype=torch.float16)
 k=torch.randn(1,2,64,32,device='cuda',dtype=torch.float16);v=torch.randn_like(k)
 mask=None if length==1 else (torch.arange(64,device='cuda')[None,:] <= torch.arange(64-length,64,device='cuda')[:,None])[None,None].expand(1,4,length,64).contiguous()
 with sdpa_kernel(SDPBackend.MATH):ref=torch.nn.functional.scaled_dot_product_attention(q,k,v,attn_mask=mask,enable_gqa=True)
 actual,_=attention.efficient_attention(SimpleNamespace(is_causal=True),q,k,v,mask)
 torch.testing.assert_close(actual.transpose(1,2),ref,atol=.005,rtol=.02)
 results.append({'cached_query_length':length,'passed':True})
try:
 attention.efficient_attention(SimpleNamespace(is_causal=True),q,k,v,None)
 raise AssertionError('missing offset mask accepted')
except ValueError:pass
config=Qwen3_5TextConfig(vocab_size=257,hidden_size=128,intermediate_size=256,num_hidden_layers=2,
 num_attention_heads=4,num_key_value_heads=2,head_dim=32,layer_types=['linear_attention','full_attention'],
 linear_num_key_heads=2,linear_num_value_heads=4,linear_key_head_dim=16,linear_value_head_dim=32,
 pad_token_id=0,bos_token_id=1,eos_token_id=2,tie_word_embeddings=False,
 rope_parameters={'rope_type':'default','rope_theta':10000000.0,'partial_rotary_factor':0.25,'mrope_section':[1,1,2]})
config._attn_implementation='oneuldo_efficient'
base=Qwen3_5ForCausalLM(config).to(device='cuda',dtype=torch.float16)
base.requires_grad_(False);offload_frozen_embedding(base)
model=get_peft_model(base,LoraConfig(r=2,lora_alpha=4,lora_dropout=0,target_modules=['q_proj','v_proj'],task_type='CAUSAL_LM'))
ids=torch.tensor([[1,7,21,19]],device='cuda');model.eval()
with torch.no_grad():
 full=base(input_ids=ids,use_cache=False).logits[:,-1]
 pre=base(input_ids=ids[:,:-1],use_cache=True)
 cached=base(input_ids=ids[:,-1:],past_key_values=pre.past_key_values,use_cache=True).logits[:,-1]
 torch.testing.assert_close(cached,full,atol=.008,rtol=.03)
 output=greedy_decode(model,ids,4,{2})
 assert output['output_tokens']>0
 reference_ids=ids.clone(); expected=[]
 for step in range(4):
  next_id=model(input_ids=reference_ids,use_cache=False).logits[:,-1,:].argmax(-1,keepdim=True)
  expected.append(next_id.item());reference_ids=torch.cat((reference_ids,next_id),dim=1)
  if next_id.item()==2:break
 assert output['token_ids']==expected,(output['token_ids'],expected)
 assert greedy_decode(model,ids,4,{2})['token_ids']==expected
 assert greedy_decode(model,ids,4,{expected[0]})['output_tokens']==1
 assert greedy_decode(model,ids,1,set())['stop_reason']=='length'
results.append({'small_qwen_hybrid_cache_matches_full':True,'greedy_matches_full_recompute':True,
 'repeat_exact':True,'eos_and_length_stop_passed':True})
with tempfile.TemporaryDirectory() as folder:
 model.save_pretrained(folder,safe_serialization=True,save_embedding_layers=False)
 disk=load_file(str(Path(folder)/'adapter_model.safetensors'))
 before={n:t.detach().cpu().clone() for n,t in get_peft_model_state_dict(model).items()}
 with torch.no_grad():
  for n,p in model.named_parameters():
   if p.requires_grad:p.add_(1)
 set_peft_model_state_dict(model,disk)
 assert all(torch.equal(t,get_peft_model_state_dict(model)[n].detach().cpu()) for n,t in before.items())
results.append({'adapter_saved_and_reloaded_exactly':True,'tensor_count':len(disk)})
conditional_config=Qwen3_5Config(text_config=config,vision_config=Qwen3_5VisionConfig(
 depth=1,hidden_size=128,intermediate_size=256,num_heads=4,out_hidden_size=128,num_position_embeddings=16),
 image_token_id=253,video_token_id=254,vision_start_token_id=255,vision_end_token_id=256)
conditional_config._attn_implementation='oneuldo_efficient'
conditional=Qwen3_5ForConditionalGeneration(conditional_config).to(device='cuda',dtype=torch.float16)
half={id(conditional.get_input_embeddings().weight),id(conditional.get_output_embeddings().weight)}
for p in conditional.parameters():
 p.requires_grad_(False)
 if id(p) not in half:p.data=p.data.float()
offload_frozen_embedding(conditional)
conditional=get_peft_model(conditional,LoraConfig(r=2,lora_alpha=4,lora_dropout=0,target_modules=['q_proj','v_proj'],task_type='CAUSAL_LM'))
conditional.eval()
actual=greedy_decode(conditional,ids,4,set())['token_ids']
reference_ids=ids.clone();expected=[]
with torch.no_grad(),torch.autocast('cuda',dtype=torch.float16):
 for step in range(4):
  next_id=conditional(input_ids=reference_ids,attention_mask=torch.ones_like(reference_ids),use_cache=False,logits_to_keep=1).logits[:,-1].argmax(-1,keepdim=True)
  expected.append(next_id.item());reference_ids=torch.cat((reference_ids,next_id),dim=1)
assert actual==expected,(actual,expected)
with conditional.disable_adapter():assert greedy_decode(conditional,ids,4,set())['token_ids']==actual
results.append({'conditional_generation_mixed_dtypes_cpu_embedding_cached_matches_full':True,'zero_adapter_matches_disabled':True})
print(json.dumps({'device':torch.cuda.get_device_name(),'results':results},indent=2))
