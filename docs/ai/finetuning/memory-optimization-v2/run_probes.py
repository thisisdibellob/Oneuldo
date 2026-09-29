"""Two independent bounded probes; preserve all outputs, never save adapters."""
import json, subprocess, time
from pathlib import Path
root=Path(__file__).resolve().parent
source=root.parent/'qlora-smoke-v1'
summary={'full_training':False,'deployment':False,'attempts':[]}
for name,attention in [('attempt-03-cleanup','default'),('attempt-04-efficient','efficient')]:
    work=root/name
    work.mkdir(exist_ok=False)
    for filename in ['checkpoint-path.txt','model-provenance.json','native-verification.json','train.candidate.jsonl']:
        (work/filename).symlink_to(source/filename)
    start=time.monotonic()
    with (work/'console.log').open('w') as f:
        p=subprocess.run([str(source/'venv/bin/python'),'-u',str(root/'smoke_qlora.py'),'--work',str(work),'--attention',attention],stdout=f,stderr=subprocess.STDOUT)
    result=json.loads((work/'smoke-result.json').read_text()) if (work/'smoke-result.json').exists() else {'status':'missing_result'}
    summary['attempts'].append({'attempt':name,'exit_code':p.returncode,'seconds':time.monotonic()-start,'result':result})
    (root/'controller-result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'attempt':name,'exit_code':p.returncode,'status':result['status']},ensure_ascii=False),flush=True)
    # Only an expected CUDA OOM justifies continuing after a failed baseline.
    if p.returncode and result.get('error_type')!='OutOfMemoryError':
        raise SystemExit(p.returncode)
raise SystemExit(0 if summary['attempts'][-1]['result']['status']=='passed_three_full_example_steps' else 1)
