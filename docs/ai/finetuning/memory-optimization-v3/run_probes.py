"""One bounded probe of revised data and checkpointed vocabulary loss."""
import json,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent
source=root.parent/'qlora-smoke-v1'
work=root/'attempt-05-chunked-v3'
work.mkdir(exist_ok=False)
for name in ['checkpoint-path.txt','model-provenance.json']:(work/name).symlink_to(source/name)
for name in ['native-verification.json','train.candidate.jsonl']:(work/name).symlink_to(root/name)
start=time.monotonic()
with (work/'console.log').open('w') as f:
 p=subprocess.run([str(source/'venv/bin/python'),'-u',str(root/'smoke_qlora.py'),'--work',str(work),'--attention','efficient'],stdout=f,stderr=subprocess.STDOUT)
result=json.loads((work/'smoke-result.json').read_text()) if (work/'smoke-result.json').exists() else {'status':'missing_result'}
summary={'full_training':False,'deployment':False,'seconds':time.monotonic()-start,'exit_code':p.returncode,'result':result}
(root/'controller-result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'exit_code':p.returncode,'status':result['status']},ensure_ascii=False),flush=True)
raise SystemExit(p.returncode)
