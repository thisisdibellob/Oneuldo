"""Real FP16 overflow: no weight/state change, lower scale, one valid retry update."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
import json,torch
from stable_step import backward_and_step
assert torch.cuda.device_count()==1
p=torch.nn.Parameter(torch.tensor([1.0],device='cuda'))
optimizer=torch.optim.AdamW([p],lr=1e-5,foreach=False)
scaler=torch.amp.GradScaler('cuda',init_scale=256)
old=p.detach().clone()
overflow=backward_and_step((p.half()*400).float().sum(),[('weight',p)],optimizer,scaler)
assert not overflow['applied'] and torch.equal(old,p.detach()) and len(optimizer.state)==0
assert p.grad is None and overflow['scale_after']==128
valid=backward_and_step((p.half()*400).float().sum(),[('weight',p)],optimizer,scaler)
assert valid['applied'] and not torch.equal(old,p.detach())
assert optimizer.state[p]['step'].item()==1
assert abs(valid['gradient_norm']-400)<1
after=p.detach().clone();optimizer.zero_grad(set_to_none=True)
try:
    backward_and_step(p.sum()*float('nan'),[('weight',p)],optimizer,scaler)
    raise AssertionError('nonfinite loss accepted')
except RuntimeError as e:assert str(e)=='NONFINITE_LOSS'
assert torch.equal(after,p.detach()) and optimizer.state[p]['step'].item()==1
print(json.dumps({'passed':True,'overflow':overflow,'retry':valid,
 'no_update_or_optimizer_state_on_overflow':True,'same_sample_retry_updates_once':True,
 'nonfinite_loss_rejected_without_update':True},indent=2))
