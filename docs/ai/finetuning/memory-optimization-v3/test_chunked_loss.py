"""Small GPU-1 check: uneven chunks, frozen/trainable heads, gradient equivalence."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json,torch
from chunked_loss import chunked_head_loss
assert torch.cuda.device_count()==1
torch.manual_seed(240924)
results=[]
for dtype in [torch.float32,torch.float16]:
 for train_head in [False,True]:
  for size in [1,7,32,99]:
   h=torch.randn(1,37,64,device='cuda',dtype=dtype,requires_grad=True)
   head=torch.nn.Linear(64,509,bias=False,device='cuda',dtype=dtype)
   head.weight.requires_grad_(train_head)
   y=torch.randint(0,509,(1,37),device='cuda')
   params=(h,head.weight) if train_head else (h,)
   ref=torch.nn.functional.cross_entropy(head(h).float().reshape(-1,509),y.reshape(-1))
   gref=torch.autograd.grad(ref,params)
   actual=chunked_head_loss(h,head,y,size)
   g=torch.autograd.grad(actual,params)
   tol=0.0002 if dtype==torch.float16 else 0.000002
   torch.testing.assert_close(actual,ref,atol=tol,rtol=tol)
   for x,z in zip(g,gref):torch.testing.assert_close(x,z,atol=tol,rtol=0.02 if dtype==torch.float16 else 0.00001)
   results.append({'dtype':str(dtype),'train_head':train_head,'chunk_size':size,
      'loss_abs_error':abs(actual.item()-ref.item()),'max_gradient_error':max((x-z).abs().max().item() for x,z in zip(g,gref)),'passed':True})
print(json.dumps({'device':torch.cuda.get_device_name(),'torch':torch.__version__,'results':results},indent=2))
