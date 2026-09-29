import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json,torch
from frozen_embedding import FrozenCPUEmbedding
assert torch.cuda.device_count()==1
torch.manual_seed(240924)
results=[]
for dtype in [torch.float32,torch.float16]:
    original=torch.nn.Embedding(257,64,padding_idx=0,device='cuda',dtype=dtype)
    original.weight.requires_grad_(False)
    offloaded=FrozenCPUEmbedding(original)
    ids=torch.tensor([[0,1,2,256,2,1]],device='cuda')
    a=original(ids);b=offloaded(ids)
    torch.testing.assert_close(a,b,atol=0,rtol=0)
    downstream=torch.nn.Linear(64,16,bias=False,device='cuda',dtype=dtype)
    ref=downstream(a).float().square().mean()
    grad_ref=torch.autograd.grad(ref,downstream.weight)[0]
    actual=downstream(b).float().square().mean()
    grad_actual=torch.autograd.grad(actual,downstream.weight)[0]
    torch.testing.assert_close(grad_actual,grad_ref,atol=0,rtol=0)
    assert not offloaded.weight.requires_grad and offloaded.weight.device.type=='cpu'
    results.append({'dtype':str(dtype),'lookup_exact_match':True,'downstream_gradient_exact_match':True})
try:
    FrozenCPUEmbedding(torch.nn.Embedding(2,3,device='cuda'))
    raise AssertionError('trainable input accepted')
except ValueError:pass
print(json.dumps({'device':torch.cuda.get_device_name(),'results':results,'trainable_embedding_rejected':True},indent=2))
