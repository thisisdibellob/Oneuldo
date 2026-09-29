#!/usr/bin/env python3
"""Real local tokenizer + pinned official chat template; no weights or inference.

Counts seed rows and production-factory previews separately. No truncation and no
padding. Checks assistant-only loss boundaries; does not run any training.
"""
import hashlib
import importlib.metadata
import json
import shutil
import statistics
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE/'contract-v1'
TOKENIZER = ROOT/'backend/src/main/resources/ai/tokenizers/qwen3.6-27b/tokenizer.json'
TOKENIZER_HASH = '5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42'


def measure(tokenizer, messages):
    if [m['role'] for m in messages] != ['system', 'user', 'assistant']:
        raise ValueError('EXPECTED_SINGLE_TURN_SUPERVISED_EXAMPLE')
    prompt = tokenizer.apply_chat_template(messages[:2], tokenize=False,
                                            add_generation_prompt=True, enable_thinking=False)
    full = tokenizer.apply_chat_template(messages, tokenize=False,
                                          add_generation_prompt=False, enable_thinking=False)
    if not full.startswith(prompt):
        raise ValueError('CHAT_TEMPLATE_PROMPT_PREFIX_MISMATCH')
    # Text is templated exactly once; special tokens already exist in that text.
    ids = tokenizer.encode(full, add_special_tokens=False, truncation=False)
    prompt_ids = tokenizer.encode(prompt, add_special_tokens=False, truncation=False)
    if ids[:len(prompt_ids)] != prompt_ids:
        raise ValueError('TOKEN_BOUNDARY_MISMATCH')
    target = ids[len(prompt_ids):]
    if tokenizer.eos_token_id not in target:
        raise ValueError('ASSISTANT_EOS_MISSING')
    # Template has no generation mask. Explicit prefix masking avoids training on
    # system instructions, user events, or the no-thinking assistant prefix.
    labels = [-100] * len(prompt_ids) + target
    assert len(ids) == len(labels) and all(x == -100 for x in labels[:len(prompt_ids)])
    return {'prompt_tokens': len(prompt_ids), 'target_tokens_with_eos': len(target),
            'total_tokens': len(ids), 'assistant_only_mask_checked': True,
            'fits_4096': len(ids) <= 4096, 'fits_8192': len(ids) <= 8192,
            'fits_18432': len(ids) <= 18432,
            'rendered_sha256': hashlib.sha256(full.encode()).hexdigest()}


def main():
    from transformers import AutoTokenizer
    meta = OUT/'model-metadata'
    provenance = json.loads((meta/'provenance.json').read_text())
    if hashlib.sha256(TOKENIZER.read_bytes()).hexdigest() != TOKENIZER_HASH:
        raise ValueError('LOCAL_TOKENIZER_HASH_MISMATCH')
    for f in provenance['files']:
        if hashlib.sha256((meta/f['file']).read_bytes()).hexdigest() != f['sha256']:
            raise ValueError('MODEL_METADATA_HASH_MISMATCH')
    records = []
    with tempfile.TemporaryDirectory(prefix='oneuldo-tokenizer-') as folder:
        for name in ('config.json', 'tokenizer_config.json', 'chat_template.jinja'):
            shutil.copyfile(meta/name, Path(folder)/name)
        shutil.copyfile(TOKENIZER, Path(folder)/'tokenizer.json')
        tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
        for split in ('train', 'eval'):
            for row in map(json.loads, (HERE/'seed-v1'/f'{split}.draft.jsonl').read_text().splitlines()):
                records.append({'id': row['id'], 'split': split, 'scope': 'NORMALIZED_SEED',
                                **measure(tokenizer, row['messages'])})
        for row in map(json.loads, (OUT/'native-messages.preview.jsonl').read_text().splitlines()):
            records.append({'id': row['id'], 'split': row['split'], 'scope': 'NATIVE_DTO_PREVIEW',
                            **measure(tokenizer, row['messages'])})
    groups = {}
    for scope in ('NORMALIZED_SEED', 'NATIVE_DTO_PREVIEW'):
        subset = [x for x in records if x['scope'] == scope]
        groups[scope] = {'count': len(subset), 'min_total': min(x['total_tokens'] for x in subset),
                         'median_total': statistics.median(x['total_tokens'] for x in subset),
                         'max_total': max(x['total_tokens'] for x in subset),
                         'over_4096': [x['id'] for x in subset if not x['fits_4096']],
                         'over_8192': [x['id'] for x in subset if not x['fits_8192']]}
    result = {'repository': provenance['repository'], 'revision': provenance['revision'],
              'tokenizer_sha256': TOKENIZER_HASH, 'enable_thinking': False,
              'truncation': False, 'padding': False, 'add_special_tokens_after_template': False,
              'server_weight_identity_verified': False, 'weights_loaded': False,
              'libraries': {k: importlib.metadata.version(k) for k in ['transformers', 'tokenizers', 'jinja2']},
              'note': 'Exact for these local template/tokenizer files; not proof of serving GGUF identity or GPU training capacity.',
              'groups': groups, 'cases': records}
    (OUT/'token-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    (OUT/'tokenizer-requirements.txt').write_text('\n'.join(f'{k}=={v}' for k, v in result['libraries'].items())+'\n')
    print(json.dumps(groups, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
