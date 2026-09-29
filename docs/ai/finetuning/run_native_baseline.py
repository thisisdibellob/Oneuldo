#!/usr/bin/env python3
"""Frozen native-v2 baseline. No target/rubric sent; no ambiguous request retries."""
import argparse,json,http.client,time
from pathlib import Path
import run_baseline as transport
HERE=Path(__file__).resolve().parent

def prepare(dest,ssh_port=None):
    source=HERE/'native-v2/eval.candidate.jsonl';data=source.read_bytes()
    expected=json.loads((HERE/'native-v2/verification.json').read_text())['sha256']['eval.candidate.jsonl']
    if transport.sha(data)!=expected:raise ValueError('NATIVE_EVAL_CHANGED')
    rows=list(map(json.loads,data.decode().splitlines()))
    assert len(rows)==25 and {r['id'] for r in rows}=={f'E{i:02}' for i in range(1,26)}
    assert sum(r['task']=='session_analysis' for r in rows)==17
    dest.mkdir(parents=True,exist_ok=True)
    frozen=dest/'eval.frozen.jsonl'
    if frozen.exists() and frozen.read_bytes()!=data:raise ValueError('FROZEN_EVAL_CHANGED')
    if not frozen.exists():frozen.write_bytes(data)
    protocol={'version':'native-v2-baseline','endpoint':'https://'+transport.HOST+'/api/chat',
      'transport':('ssh-local-forward' if ssh_port else 'public-https'),'ssh_local_port':ssh_port,
      'eval_sha256':transport.sha(data),'case_count':25,'model':transport.MODEL,
      'model_digest_verified':False,'options':transport.OPTIONS,'think':False,'stream':False,'format':None,
      'concurrency':1,'repetitions':1,'repair':False,'post_submission_retries':False,
      'scope':'Actual production prompt factories, direct model calls; not full pipeline/review/application execution.',
      'eval_role':'Development cases, synthetic authored targets; not clinical ground truth or blind generalization test.',
      'request_sha256':{r['id']:transport.sha(json.dumps(transport.request_for(r),ensure_ascii=False).encode()) for r in rows}}
    path=dest/'protocol.json'
    if path.exists() and json.loads(path.read_text())!=protocol:raise ValueError('PROTOCOL_CHANGED')
    if not path.exists():transport.write(path,protocol)
    return rows

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=HERE/'baseline-native-v2')
    p.add_argument('--run',action='store_true');p.add_argument('--key-file',type=Path,default=Path.home()/'.local/share/oneuldo/school-gateway-client.key')
    p.add_argument('--ssh-port',type=int)
    a=p.parse_args();rows=prepare(a.out,a.ssh_port);print('Frozen native evaluation:',len(rows),flush=True)
    if a.ssh_port:
        def ssh_connect(attempts):
            t=time.monotonic();c=http.client.HTTPConnection('127.0.0.1',a.ssh_port,timeout=8)
            try:
                c.connect();c.sock.settimeout(1500)
                attempts.append({'at':transport.now(),'connected':True,'transport':'ssh-local-forward','seconds':round(time.monotonic()-t,3)})
                return c
            except OSError as e:
                c.close();attempts.append({'connected':False,'error_type':type(e).__name__});return None
        transport.connect=ssh_connect
    if a.run:transport.run(a.out,rows,a.key_file)
if __name__=='__main__':main()
