"""Verify every reused baseline artifact and unchanged inference/data file."""
import hashlib,json
from pathlib import Path

def verify(root):
    policy=json.loads((root/'recovery-policy.json').read_text())
    for name,digest in policy['sha256'].items():
        assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'REUSE_HASH_MISMATCH:'+name
    previous=json.loads((root/policy['previous_result']).read_text())
    assert previous['status']=='failed' and previous['failed_stage']=='training'
    assert len(previous['before'])==25 and len(previous['training_steps'])==12
    assert previous['protocol_sha256']==hashlib.sha256((root/'protocol.json').read_bytes()).hexdigest()
    rows=[json.loads(x) for x in (root/'eval.prompts.jsonl').read_text().splitlines()]
    for row in rows:
        record=json.loads((root/policy['baseline_folder']/(row['id']+'.json')).read_text())
        assert record['id']==row['id'] and record['messages']==row['messages']
        assert record['backend']=='local_hf' and record['phase']=='before' and record['stop_reason']=='eos'
    return policy,previous

if __name__=='__main__':
    verify(Path(__file__).resolve().parent)
    print('BASELINE_REUSE_FILES_VERIFIED: 25 unchanged original outputs; runtime canary still required.')
