"""GPU 1 numerical and mask checks for the exact probe attention wrapper."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json, torch
from types import SimpleNamespace
from torch.nn.attention import sdpa_kernel, SDPBackend
import efficient_attention as backend
assert torch.cuda.device_count()==1
backend.register()
torch.manual_seed(240924)
q=torch.randn(1,24,64,256,device='cuda',dtype=torch.float16,requires_grad=True)
k=torch.randn(1,4,64,256,device='cuda',dtype=torch.float16,requires_grad=True)
v=torch.randn_like(k,requires_grad=True)
upstream=torch.randn_like(q)
mask=torch.ones(64,64,device='cuda',dtype=torch.bool).tril()
mask[:,9]=False
mask=mask[None,None].expand(1,24,64,64).contiguous()
float_mask=torch.zeros_like(mask,dtype=torch.float16).masked_fill(~mask,float('-inf'))
results=[]
for name,m,causal in [('causal',None,True),('bool_mask',mask,True),('float_mask',float_mask,True),('noncausal',None,False)]:
    with sdpa_kernel(SDPBackend.MATH):
        ref=torch.nn.functional.scaled_dot_product_attention(q,k,v,attn_mask=m,is_causal=causal and m is None,enable_gqa=True,scale=0.0625)
        refg=torch.autograd.grad(ref,(q,k,v),upstream)
    out,_=backend.efficient_attention(SimpleNamespace(is_causal=causal),q,k,v,m,scaling=0.0625)
    out=out.transpose(1,2)
    gradients=torch.autograd.grad(out,(q,k,v),upstream)
    diffs=[]
    for actual,expected in zip([out,*gradients],[ref,*refg]):
        torch.testing.assert_close(actual,expected,atol=0.015,rtol=0.02)
        diffs.append((actual-expected).abs().max().item())
    results.append({'case':name,'passed':True,'max_absolute_errors':diffs})
with torch.no_grad():
    original,_=backend.efficient_attention(SimpleNamespace(is_causal=True),q,k,v,None)
    changed=v.clone();changed[:,:,32:]+=10
    modified,_=backend.efficient_attention(SimpleNamespace(is_causal=True),q,k,changed,None)
    torch.testing.assert_close(original[:,:32],modified[:,:32],atol=0,rtol=0)
results.append({'case':'future_tokens_do_not_change_past','passed':True})
print(json.dumps({'torch':torch.__version__,'device':torch.cuda.get_device_name(),'results':results,'statistics':backend.statistics()},indent=2))
