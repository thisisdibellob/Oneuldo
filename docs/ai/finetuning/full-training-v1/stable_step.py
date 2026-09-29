"""Do not apply nonfinite gradients. Lower AMP scale and retry the same sample."""
import torch

def backward_and_step(loss,named_parameters,optimizer,scaler):
    if not torch.isfinite(loss):raise RuntimeError('NONFINITE_LOSS')
    scale_before=scaler.get_scale()
    scaler.scale(loss).backward();scaler.unscale_(optimizer)
    available=[(n,p) for n,p in named_parameters if p.grad is not None]
    if not available:raise RuntimeError('MISSING_ADAPTER_GRADIENT')
    bad=[n for n,p in available if not torch.isfinite(p.grad).all().item()]
    if bad:
        # No optimizer step: weights and Adam moments remain untouched.
        scaler.update(new_scale=scale_before/2)
        optimizer.zero_grad(set_to_none=True)
        return {'applied':False,'scale_before':scale_before,'scale_after':scaler.get_scale(),
                'nonfinite_parameter_count':len(bad),'nonfinite_parameter_examples':bad[:8]}
    norm=torch.nn.utils.clip_grad_norm_([p for _,p in named_parameters],1.0)
    if not torch.isfinite(norm) or norm.item()==0:raise RuntimeError('INVALID_ADAPTER_GRADIENT_NORM')
    scaler.step(optimizer);scaler.update()
    return {'applied':True,'gradient_norm':norm.item(),'scale_before':scale_before,'scale_after':scaler.get_scale()}
