#!/usr/bin/env python3
"""Audit the actual exported 60/25 candidates, not the normalized source drafts."""
import hashlib
import importlib.metadata
import json
import re
import shutil
import statistics
import tempfile
from collections import Counter,defaultdict
from pathlib import Path
from audit_contract_tokens import measure,TOKENIZER,TOKENIZER_HASH
from build_native_v2 import HERE,OUT,sha

# Strip identifiers and dates only for duplicate detection; never for training.
def canonical(v):
    if isinstance(v,dict):return {k:canonical(x) for k,x in v.items() if k not in ['anonymousSubjectId','generatedAt','datasetId','id']}
    if isinstance(v,list):return [canonical(x) for x in v]
    if isinstance(v,str):
        v=re.sub(r'[TE]\d{2}-(mission|synthetic)',r'CASE-\1',v)
        v=re.sub(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b','UUID',v)
        return v
    return v

def main():
    from transformers import AutoTokenizer
    meta=HERE/'contract-v1/model-metadata';prov=json.loads((meta/'provenance.json').read_text())
    assert sha(TOKENIZER)==TOKENIZER_HASH
    for f in prov['files']:assert sha(meta/f['file'])==f['sha256']
    rows=[];records=[];dupes=defaultdict(list)
    for split in ['train','eval']:
        batch=list(map(json.loads,(OUT/f'{split}.candidate.jsonl').read_text().splitlines()))
        assert len(batch)==(60 if split=='train' else 25)
        rows+=batch
        for task in ['session_analysis','profile_update']:
            selected=[r for r in batch if r['task']==task]
            (OUT/f'{split}.{task}.candidate.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in selected))
    with tempfile.TemporaryDirectory(prefix='oneuldo-native-v2-tokenizer-') as folder:
        for name in ['config.json','tokenizer_config.json','chat_template.jinja']:shutil.copyfile(meta/name,Path(folder)/name)
        shutil.copyfile(TOKENIZER,Path(folder)/'tokenizer.json')
        tokenizer=AutoTokenizer.from_pretrained(folder,local_files_only=True,trust_remote_code=False)
        for r in rows:
            records.append({'id':r['id'],'split':r['split'],'task':r['task'],**measure(tokenizer,r['messages'])})
            # Compare expanded actual prompts, so table packing and map order cannot hide duplicates.
            x=json.loads((OUT/'expanded-inputs'/f"{r['id']}.json").read_text())
            signature=json.dumps(canonical(x),ensure_ascii=False,sort_keys=True,separators=(',',':'))
            dupes[signature].append({'id':r['id'],'split':r['split']})
    groups={}
    for split in ['train','eval']:
        for task in ['session_analysis','profile_update']:
            rs=[r for r in records if r['split']==split and r['task']==task]
            groups[f'{split}/{task}']={'count':len(rs),'min_tokens':min(r['total_tokens'] for r in rs),
                'median_tokens':statistics.median(r['total_tokens'] for r in rs),'max_tokens':max(r['total_tokens'] for r in rs),
                'over_4096':[r['id'] for r in rs if not r['fits_4096']], 'over_8192':[r['id'] for r in rs if not r['fits_8192']]}
    result={'tokenizer_repository':prov['repository'],'tokenizer_revision':prov['revision'],'tokenizer_sha256':TOKENIZER_HASH,
            'enable_thinking':False,'truncation':False,'padding':False,'weights_loaded':False,
            'server_weight_identity_verified':False,'libraries':{k:importlib.metadata.version(k) for k in ['transformers','tokenizers','jinja2']},
            'groups':groups,'cases':records}
    (OUT/'token-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    duplicate_groups=[v for v in dupes.values() if len(v)>1]
    audit={'normalized_exact_input_duplicates':duplicate_groups,
           'cross_split_exact_duplicates':[g for g in duplicate_groups if len({r['split'] for r in g})>1],
           'note':'Exact normalized inputs only. Related scenario families remain across splits; this is a development set, not blind generalization evidence.'}
    (OUT/'split-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    assert not audit['cross_split_exact_duplicates'],'TRAIN_EVAL_EXACT_INPUT_LEAK'
    report=['# 운영 입력 재작성 사례 85개','',
            '모두 저자 작성 합성 사례다. 모델의 실제 응답·실제 참여자의 행동·전문가 승인 정답이 아니다.',
            '프로필 입력은 합성된 이전/현재 분석이며, 보고·수집 비고 등이 실제 게임 수집기에 구현됐다는 뜻이 아니다.',
            '학습/평가 자료는 개발용이다. 정답을 확인하며 재작성했으므로 새로운 독립 평가 자료가 별도로 필요하다.','']
    manifest=json.loads((OUT/'manifest.json').read_text())
    byid={r['id']:r for r in rows}
    for c in manifest['cases']:
        r=byid[c['id']];report += [f"## {c['id']} · {c['split']} · {c['task']}",'',f"원래 항목: {c['original_title']}",'',c['rewrite_note'],'']
        if c['task']=='profile_update':
            x=json.loads((OUT/'inputs'/f"{c['id']}.json").read_text())
            report+=['### 새 입력의 이전 프로필·현재 분석','', '```json',json.dumps(x,ensure_ascii=False,indent=2),'```','']
        else:report+=['### 새 입력의 사실 발췌','', '```json',json.dumps(c['input_fact_excerpt'],ensure_ascii=False,indent=2),'```','']
        report+=['### 작성한 목표 답변(읽기용 펼친 형식)','', '```json',json.dumps(c['expected_expanded'],ensure_ascii=False,indent=2),'```','']
    (OUT/'cases-review.ko.md').write_text('\n'.join(report))
    hashes={str(p.relative_to(OUT)):sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name not in ['verification.json','README.ko.md']}
    verification={'candidate_counts':{'train':60,'eval':25},'production_roundtrips':len(json.loads((OUT/'production-validation.json').read_text())),
       'source_hashes':manifest['source_sha256'],'training_approved':False,'training_executed':False,'model_inference_executed':False,
       'runtime_sources_modified':False,'token_boundary_checks':len(records),'sha256':hashes}
    (OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'groups':groups,'duplicates':audit},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
