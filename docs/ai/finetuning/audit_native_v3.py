"""Reuse tokenizer/duplicate audit with v3 output; never change v2/eval bytes."""
import json,hashlib
from collections import Counter
from pathlib import Path
import audit_native_v2 as common
HERE=Path(__file__).resolve().parent
def main():
 common.OUT=HERE/'native-v3'
 common.main()
 out=common.OUT;old=HERE/'native-v2'
 assert (out/'eval.candidate.jsonl').read_bytes()==(old/'eval.candidate.jsonl').read_bytes()
 for name,h in json.loads((old/'verification.json').read_text())['sha256'].items():
  assert hashlib.sha256((old/name).read_bytes()).hexdigest()==h,name
 manifests={v:json.loads((HERE/v/'manifest.json').read_text()) for v in ['native-v2','native-v3']}
 fields=['itemCount','recommendedDifficulty','quantityComplexity','budgetPressure','textSupport']
 dist={v:{k:dict(Counter(str(c['expected_expanded']['practicePlan'][k]) for c in m['cases'] if c['split']=='train')) for k in fields} for v,m in manifests.items()}
 (out/'distribution-review.json').write_text(json.dumps(dist,ensure_ascii=False,indent=2)+'\n')
 v=json.loads((out/'verification.json').read_text())
 v.update(version='native-v3',evaluation_bytes_unchanged=True,original_v2_hashes_unchanged=True,
          clinical_validation=False,full_training_executed=False)
 # Register the final distribution file; verification itself is intentionally excluded.
 v['sha256']['distribution-review.json']=hashlib.sha256((out/'distribution-review.json').read_bytes()).hexdigest()
 (out/'verification.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(dist,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
