"""Small GPU-1-only numerical/backward checks before full model maintenance."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json,torch
from torch.nn.attention import sdpa_kernel,SDPBackend
from torch.nn.functional import scaled_dot_product_attention as sdpa
assert torch.cuda.device_count()==1
torch.manual_seed(240924)
q=torch.randn(1,24,64,256,device='cuda',dtype=torch.float16,requires_grad=True)
k=torch.randn(1,4,64,256,device='cuda',dtype=torch.float16,requires_grad=True)
v=torch.randn_like(k,requires_grad=True)
upstream=torch.randn_like(q)
with sdpa_kernel(SDPBackend.MATH):
 ref=sdpa(q,k,v,is_causal=True,enable_gqa=True)
 refg=torch.autograd.grad(ref,(q,k,v),upstream)
results=[]
for repeat in [False,True]:
 try:
  with sdpa_kernel(SDPBackend.EFFICIENT_ATTENTION):
   out=sdpa(q,k.repeat_interleave(6,dim=1) if repeat else k,v.repeat_interleave(6,dim=1) if repeat else v,is_causal=True,enable_gqa=not repeat)
   gradients=torch.autograd.grad(out,(q,k,v),upstream)
  diffs=[(a-b).abs().max().item() for a,b in zip([out,*gradients],[ref,*refg])]
  for actual,expected in zip([out,*gradients],[ref,*refg]):torch.testing.assert_close(actual,expected,atol=0.015,rtol=0.02)
  results.append({'repeat_kv':repeat,'passed':True,'max_absolute_errors_output_q_k_v':diffs})
 except Exception as e:results.append({'repeat_kv':repeat,'passed':False,'type':type(e).__name__,'error':str(e)})
print(json.dumps({'torch':torch.__version__,'device':torch.cuda.get_device_name(),'compute_capability':torch.cuda.get_device_capability(),'results':results},indent=2))
