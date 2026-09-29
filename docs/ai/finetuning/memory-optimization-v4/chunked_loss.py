"""Exact token-mean CE with recomputed vocabulary projections, no truncation."""
import torch
from torch.utils.checkpoint import checkpoint

def chunked_head_loss(hidden, head, targets, chunk_size=32):
    if chunk_size < 1 or hidden.shape[:-1] != targets.shape or targets.numel()==0:
        raise ValueError('INVALID_LOSS_SHAPE_OR_CHUNK')
    # This probe supervises only assistant tokens. Reject ignored/negative IDs
    # so averaging cannot silently change relative to the full-token reference.
    if (targets < 0).any():
        raise ValueError('EXPECTED_ONLY_SUPERVISED_TARGETS')
    h=hidden.reshape(-1,hidden.shape[-1]); y=targets.reshape(-1)
    def part(x,t):
        logits=head(x)
        return torch.nn.functional.cross_entropy(logits.float(),t,reduction='sum')
    pieces=[checkpoint(part,h[start:start+chunk_size],y[start:start+chunk_size],
                       use_reentrant=False)
            for start in range(0,y.numel(),chunk_size)]
    return torch.stack(pieces).sum()/y.numel()
