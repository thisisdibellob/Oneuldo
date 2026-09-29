"""Keep frozen, untied token embeddings on CPU; return lookup rows to caller GPU."""
import torch
from torch import nn

class FrozenCPUEmbedding(nn.Module):
    def __init__(self, embedding):
        super().__init__()
        if embedding.weight.requires_grad or embedding.max_norm is not None:
            raise ValueError('OFFLOAD_REQUIRES_FROZEN_NON_MUTATING_EMBEDDING')
        self.weight=nn.Parameter(embedding.weight.detach().to('cpu'),requires_grad=False)
        self.padding_idx=embedding.padding_idx
        self.num_embeddings=embedding.num_embeddings
        self.embedding_dim=embedding.embedding_dim

    def forward(self, input_ids):
        return torch.nn.functional.embedding(input_ids.to('cpu'),self.weight,
            padding_idx=self.padding_idx).to(input_ids.device)

def offload_frozen_embedding(model):
    old=model.get_input_embeddings()
    if old.weight is model.get_output_embeddings().weight:
        raise ValueError('TIED_EMBEDDING_OFFLOAD_NOT_SUPPORTED')
    size=old.weight.numel()*old.weight.element_size()
    new=FrozenCPUEmbedding(old)
    model.set_input_embeddings(new)
    del old
    return {'storage_device':str(new.weight.device),'dtype':str(new.weight.dtype),
            'bytes_moved_to_cpu':size,'input_values_truncated':False}
