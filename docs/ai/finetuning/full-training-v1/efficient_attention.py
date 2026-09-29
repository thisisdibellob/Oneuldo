"""SDPA backend for matched training/evaluation, preserving causal/padding mask semantics.

Explicit KV repetition permits PyTorch 2.10 memory-efficient attention on the
TITAN RTX. No silent fallback to a quadratic math kernel. Supports single-token cached decoding and explicit offset masks.
"""
import torch
from torch.nn.attention import sdpa_kernel, SDPBackend

calls = 0
shapes = set()

def efficient_attention(module, query, key, value, attention_mask,
                        dropout=0.0, scaling=None, is_causal=None,
                        position_bias=None, **kwargs):
    global calls
    if position_bias is not None or kwargs.get('output_attentions',False):
        raise ValueError('UNSUPPORTED_PROBE_ATTENTION_OPTIONS')
    if key.shape != value.shape or query.shape[-2] > key.shape[-2]:
        raise ValueError('INVALID_KV_SHAPE')
    if query.shape[-2] != key.shape[-2] and query.shape[-2] > 1 and attention_mask is None:
        raise ValueError('OFFSET_CAUSAL_MASK_REQUIRED_FOR_MULTI_TOKEN_CACHE')
    if query.shape[1] % key.shape[1]:
        raise ValueError('INVALID_GROUPED_HEADS')
    repeat = query.shape[1] // key.shape[1]
    if repeat > 1:
        key = key.repeat_interleave(repeat, dim=1)
        value = value.repeat_interleave(repeat, dim=1)
    causal = getattr(module,'is_causal',True) if is_causal is None else is_causal
    causal = bool(causal and query.shape[-2] > 1 and attention_mask is None)
    with sdpa_kernel(SDPBackend.EFFICIENT_ATTENTION):
        output = torch.nn.functional.scaled_dot_product_attention(
            query, key, value, attn_mask=attention_mask, dropout_p=dropout,
            scale=scaling, is_causal=causal)
    calls += 1
    shapes.add(tuple(query.shape))
    return output.transpose(1,2).contiguous(), None

def register():
    from transformers import AttentionInterface
    from transformers.masking_utils import AttentionMaskInterface, ALL_MASK_ATTENTION_FUNCTIONS
    AttentionInterface.register('oneuldo_efficient',efficient_attention)
    # Reuse the standard SDPA mask builder; never skip mask creation.
    AttentionMaskInterface.register('oneuldo_efficient',ALL_MASK_ATTENTION_FUNCTIONS['sdpa'])

def statistics():
    return {'calls':calls,'query_shapes':sorted(shapes),'backend':'EFFICIENT_ATTENTION_ONLY'}
