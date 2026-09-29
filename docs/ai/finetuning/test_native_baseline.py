import copy,json,unittest
from pathlib import Path
from check_native_baseline import expand,inspect_native
from run_baseline import request_for

HERE=Path(__file__).parent
class NativeBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows={r['id']:r for r in map(json.loads,(HERE/'native-v2/eval.candidate.jsonl').read_text().splitlines())}
    def test_frozen_requests_do_not_send_authored_answers(self):
        for row in self.rows.values():
            request=request_for(row)
            self.assertEqual(request['messages'],row['messages'][:2])
            self.assertNotIn('assistant',[m['role'] for m in request['messages']])
    def test_rejects_unknown_event_reference(self):
        row=self.rows['E01'];x=json.loads(row['messages'][2]['content']);x['f'][0][5]=['E999']
        self.assertIn('finding_1:unknown_event_id',inspect_native(row,json.dumps(x))[1]['reference_errors'])
    def test_rejects_unknown_profile_reference(self):
        row=self.rows['E22'];x=json.loads(row['messages'][2]['content']);x['findings'][0]['evidenceEventIds']=['R999']
        self.assertIn('finding_1:unknown_event_id',inspect_native(row,json.dumps(x))[1]['reference_errors'])
    def test_rejects_incomplete_compact_finding(self):
        x=json.loads(self.rows['E01']['messages'][2]['content']);x['f'][0].pop()
        with self.assertRaisesRegex(ValueError,'row_length'):expand(json.dumps(x))
    def test_rejects_duplicate_keys(self):
        with self.assertRaisesRegex(ValueError,'duplicate_json_key'):expand('{"s":"a","s":"b"}')
    def test_records_three_real_production_rejections(self):
        for case in ['E06','E12','E16']:
            saved=json.loads((HERE/f'baseline-native-v2-ssh/responses/{case}.json').read_text())
            raw=json.loads(saved['response_body'])['message']['content']
            try:
                _,check=inspect_native(self.rows[case],raw)
                self.assertTrue(check['schema_errors'] or check['reference_errors'],case)
            except ValueError:
                self.assertEqual(case,'E12')
if __name__=='__main__':unittest.main()
