"""Independent checks for lost observations, answer leakage and split/reference errors."""
import copy
import json
import unittest
from pathlib import Path
from build_native_v2 import (OUT, seed_rows, profile_fixture, session_source, session_fixture, uid, EXPECTED, HERE, sha)

class NativeV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows=seed_rows();cls.manifest=json.loads((OUT/'manifest.json').read_text())

    def test_inputs_do_not_depend_on_target_answers_or_rubric(self):
        for row in self.rows:
            altered=copy.deepcopy(row);altered['messages'][2]['content']='TARGET_SHOULD_NEVER_BE_READ'
            altered['rubric']={'leak':'HIDDEN_CORRECT_JUDGMENT'}
            if row['task']=='profile_update':self.assertEqual(profile_fixture(row),profile_fixture(altered),row['id'])
            else:self.assertEqual(session_source(row),session_source(altered),row['id'])

    def test_train_eval_size_and_event_identity_separation(self):
        sets={}
        for split,n in [('train',60),('eval',25)]:
            rows=[c for c in self.manifest['cases'] if c['split']==split]
            self.assertEqual(n,len(rows));sets[split]={v for c in rows for v in c['reference_remap'].values()}
            self.assertTrue(all(not c['training_approved'] for c in rows))
        self.assertFalse(sets['train']&sets['eval'])
        self.assertEqual({'train/session_analysis':40,'train/profile_update':20,'eval/session_analysis':17,'eval/profile_update':8},
            {f'{s}/{t}':sum(c['split']==s and c['task']==t for c in self.manifest['cases'])
             for s in ['train','eval'] for t in ['session_analysis','profile_update']})

    def test_critical_session_facts_survive_real_prompt_compaction(self):
        for c in self.manifest['cases']:
            if c['task']!='session_analysis':continue
            i=c['id'];src=json.loads((OUT/'inputs'/f'{i}.json').read_text())
            prompt=json.loads((OUT/'expanded-inputs'/f'{i}.json').read_text())
            ss=src['input']['sessions'];ps=prompt['behaviorTimeline']['sessions']
            self.assertEqual(len(ss),len(ps),i)
            for sn,(source,visible) in enumerate(zip(ss,ps),1):
                self.assertEqual(source['startedAt'],visible['startedAt'],i)
                self.assertEqual(len(source['events']),len(visible['events']),i)
                for e,v in zip(source['events'],visible['events']):
                    for key in ['sequence','elapsedFromSessionStartMs','action']:
                        self.assertEqual(e[key],v[key],(i,key))
                    for key in ['sessionEnd','presentation']:
                        if key in e:self.assertEqual(e[key],v[key],(i,key))
                    a=e['payload'];b=v['payload']
                    for key in ['itemId','quantityBefore','quantityAfter','cartTotalAmount','x','y','stationId','catalogVersion']:
                        if key in a:self.assertEqual(a[key],b[key],(i,key))
                    am=a.get('marketContent',{});bm=b.get('marketContent',{})
                    if 'cart' in am:self.assertEqual(am['cart'],bm['cart'],i)
                    scene=am.get('sceneSnapshot')
                    if scene:
                        vs=bm['sceneSnapshot']
                        for key in ['mission','layoutVersion','catalogVersion']:
                            if key in scene:self.assertEqual(scene[key],vs[key],(i,key))
                        if 'products' in scene:
                            catalog=next(x for x in prompt['referencedSceneProducts'] if x['sessionId']==f'S{sn}')
                            self.assertEqual(scene['products'],catalog['scenes'][0]['products'],i)
            # Timing transport metadata is deliberately not part of the model's input.
            if i=='T40':
                self.assertNotIn('receivedAt',json.dumps(prompt))
                self.assertNotIn('25초',json.dumps(c['expected_expanded'],ensure_ascii=False))

    def test_profile_target_evidence_has_visible_adjacent_observation(self):
        for c in self.manifest['cases']:
            if c['task']!='profile_update':continue
            x=json.loads((OUT/'inputs'/f"{c['id']}.json").read_text())
            facts={e:f['observation'] for side in ['previousProfile','currentAnalysis'] for f in x[side]['findings'] for e in f['evidenceEventIds']}
            for f in c['expected_expanded']['findings']:
                for ref in f['evidenceEventIds']:self.assertIn(ref,facts,c['id'])
            for f in c['fact_lineage']:self.assertEqual(f['observation'],facts[f['event_id']])

    def test_error_examples_stay_errors_and_report_identity_is_not_erased(self):
        x=json.loads((OUT/'inputs/E22.json').read_text())
        self.assertIn('완전히 이해',x['currentAnalysis']['summary'])
        obs=[f['observation'] for f in x['currentAnalysis']['findings']]
        self.assertTrue(any('보고자 user' in o and '목록 글은 잘 모르겠어요' in o for o in obs))
        y=json.loads((OUT/'inputs/E23.json').read_text())
        self.assertIn('보고자 supporter',y['previousProfile']['findings'][0]['observation'])
        self.assertIn('보고자 facilitator',y['currentAnalysis']['findings'][0]['observation'])

    def test_no_silent_supported_to_unsupported_event_fallback(self):
        r=copy.deepcopy(next(x for x in self.rows if x['id']=='T01'))
        p=json.loads(r['messages'][1]['content']);p['sourceEventDetails'][0]['type']='UNKNOWN_NEW_PRODUCER'
        r['messages'][1]['content']=json.dumps(p)
        with self.assertRaises(KeyError):session_fixture(r['id'],session_source(r))
        r=copy.deepcopy(next(x for x in self.rows if x['id']=='T21'))
        p=json.loads(r['messages'][1]['content']);p['sourceEventDetails'][0]['type']='UNKNOWN_PROFILE_FACT'
        r['messages'][1]['content']=json.dumps(p)
        with self.assertRaises(ValueError):profile_fixture(r)

    def test_originals_unchanged_and_inputs_match_manifest(self):
        for s,h in EXPECTED.items():self.assertEqual(h,sha(HERE/'seed-v1'/f'{s}.draft.jsonl'))
        for c in self.manifest['cases']:self.assertEqual(c['input_sha256'],sha(OUT/'inputs'/f"{c['id']}.json"))

if __name__=='__main__':unittest.main()
