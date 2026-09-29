"""Offline checks of evidence, task arithmetic and target/input separation."""
import copy,json,unittest
from pathlib import Path
from build_native_v3 import SPECS,PROFILE_SPECS,make_session,make_profile,OUT,OLD,sha
class NativeV3Tests(unittest.TestCase):
 def test_session_inputs_do_not_read_targets(self):
  for spec in SPECS:
   x=list(spec);x[4]='UNDETERMINED';x[5:]=['HIGH','HIGH',1,'WRONG_TARGET_MUST_NOT_REACH_INPUT']
   self.assertEqual(make_session(spec)[0],make_session(x)[0],spec[0])
 def test_profile_inputs_do_not_read_target_plans_or_corrections(self):
  for i,s in PROFILE_SPECS.items():
   x=copy.deepcopy(s);x.update(text='SIMPLIFIED',q='HIGH',b='HIGH',d=1,correction='HIDDEN_TARGET')
   self.assertEqual(make_profile(i,s)[0],make_profile(i,x)[0],i)
 def test_frozen_evaluation_and_old_version(self):
  self.assertEqual((OLD/'eval.candidate.jsonl').read_bytes(),(OUT/'eval.candidate.jsonl').read_bytes())
  for name,h in json.loads((OLD/'verification.json').read_text())['sha256'].items():self.assertEqual(sha(OLD/name),h,name)
 def test_authored_submission_labels_and_catalog_totals(self):
  # Test fixtures only; never shipped as an application decision rule.
  for spec in SPECS:
   fx,target,source=make_session(spec);ctx=source['taskContext'][0]
   subs=[e for e in source['sourceEventDetails'] if e['type']=='submission']
   outcome=target['sessionAssessments'][0]['judgment']
   if not subs:self.assertEqual(outcome,'UNDETERMINED');continue
   e=subs[-1];self.assertEqual(e['total'],sum(ctx['catalog'][k]*n for k,n in e['cart'].items()))
   self.assertEqual(outcome=='SUCCESS',e['cart']==ctx['target'] and e['total']<=ctx['budget'])
   self.assertEqual(target['practicePlan']['itemCount'],len(ctx['target']))
 def test_all_profile_refs_have_adjacent_input_facts(self):
  m=json.loads((OUT/'manifest.json').read_text())
  for c in m['cases']:
   if c['task']!='profile_update':continue
   fx=json.loads((OUT/'inputs'/f"{c['id']}.json").read_text())
   ids={e for side in ['previousProfile','currentAnalysis'] for f in fx[side]['findings'] for e in f['evidenceEventIds']}
   for f in c['expected_expanded']['findings']:self.assertTrue(set(f['evidenceEventIds'])<=ids,c['id'])
 def test_counts_and_frozen_development_eval_scope(self):
  m=json.loads((OUT/'manifest.json').read_text())
  self.assertEqual(sum(c['split']=='train' for c in m['cases']),60)
  self.assertEqual(sum(c['split']=='eval' for c in m['cases']),25)
  self.assertEqual(len(m['changes']),27)
  self.assertFalse(m['training_approved'])
  for c in m['cases']:self.assertEqual(sha(OUT/'inputs'/f"{c['id']}.json"),c['input_sha256'])
if __name__=='__main__':unittest.main()
