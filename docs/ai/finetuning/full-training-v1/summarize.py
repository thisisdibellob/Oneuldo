"""Summarize actual run outputs. Requires complete validation; does not grade semantics."""
import json,statistics
from pathlib import Path

root=Path(__file__).resolve().parent;results=root/'results'
run=json.loads((results/'result.json').read_text())
assert run['status']=='completed_before_training_after'
phases={};raw=['# 동일 조건 학습 전후 모델 응답 원문','',
 '합성 개발 사례 25건. 원문 수정·재시도 없음. 의미 품질 검토는 별도이며 아래 통과는 프로젝트의 구조·근거 검증기 결과다.','']
for phase in ['before','after']:
    validation=json.loads((results/phase/'production-validation.json').read_text())
    checks={r['id']:r for r in validation['results']}
    rows=[json.loads((results/phase/f'E{i:02d}.json').read_text()) for i in range(1,26)]
    assert len(checks)==25
    phases[phase]={'accepted':validation['accepted'],'rejected':validation['rejected'],
        'eos_completed':sum(r['stop_reason']=='eos' for r in rows),
        'length_limited':sum(r['stop_reason']=='length' for r in rows),
        'timed_out':sum(r['stop_reason']=='timeout' for r in rows),
        'total_seconds':sum(r['seconds'] for r in rows),
        'median_seconds':statistics.median(r['seconds'] for r in rows),
        'median_output_tokens':statistics.median(r['output_tokens'] for r in rows),
        'total_output_tokens':sum(r['output_tokens'] for r in rows),
        'median_decode_tokens_per_second':statistics.median(r['decode_tokens_per_second'] for r in rows),
        'tasks':{task:{'cases':len(selected:=[r for r in rows if r['task']==task]),
                       'median_seconds':statistics.median(r['seconds'] for r in selected),
                       'accepted':sum(checks[r['id']]['accepted'] for r in selected)}
                 for task in ['session_analysis','profile_update']}}
for i in range(1,26):
    case=f'E{i:02d}';raw.extend([f'## {case}',''])
    for phase,label in [('before','학습 전'),('after','학습 후')]:
        row=json.loads((results/phase/(case+'.json')).read_text())
        raw.extend([f'### {label}',
                    f"{row['seconds']:.2f}초 / {row['output_tokens']}토큰 / 종료: {row['stop_reason']}",'',
                    '```text',row['content'],'```',''])
summary={'phases':phases,'training_steps':len(run['training_steps']),
         'training_seconds':run['training_seconds'],'current_attempt_seconds':run['elapsed_seconds'],
         'baseline_reused':run.get('baseline_reused',False),
         'numeric_retries':run.get('numeric_retries',[]),
         'max_training_allocated_mib':max(s['peak_allocated_mib'] for s in run['training_steps']),
         'adapter_sha256':run['adapter_sha256'],'semantic_quality_automatically_graded':False,
         'qualitative_review_file':'../semantic-review.json','clinical_validation':False}
previous_attempts=[json.loads(p.read_text()) for p in (root/'attempts').glob('*/results/result.json')]
summary['all_attempts_compute_seconds']=run['elapsed_seconds']+sum(a['elapsed_seconds'] for a in previous_attempts)
(results/'comparison-metrics.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(root/'model-responses.ko.md').write_text('\n'.join(raw).rstrip()+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
