"""Regression checks for answer leakage and falsely passing broken outputs."""
import copy
import json
import unittest
from pathlib import Path

from check_baseline import inspect
from run_baseline import request_for

ROWS = [json.loads(x) for x in (Path(__file__).parent/'seed-v1/eval.draft.jsonl').read_text().splitlines()]


class BaselineToolsTest(unittest.TestCase):
    def test_reference_answers_and_rubrics_are_not_sent(self):
        row = copy.deepcopy(ROWS[0])
        row['messages'][2]['content'] = 'SECRET_REFERENCE_CANARY'
        row['rubric'] = {'must_include': ['SECRET_RUBRIC_CANARY']}
        wire = request_for(row)
        self.assertEqual([x['role'] for x in wire['messages']], ['system', 'user'])
        self.assertNotIn('CANARY', json.dumps(wire))

    def test_frozen_reference_contracts_include_empty_findings(self):
        for row in ROWS:
            with self.subTest(case=row['id']):
                result = inspect(row, row['messages'][2]['content'])
                self.assertTrue(result['json_object'])
                self.assertEqual(result['schema_errors'], [])
                self.assertEqual(result['reference_errors'], [])

    def test_unknown_event_is_not_passed(self):
        row = ROWS[0]
        answer = json.loads(row['messages'][2]['content'])
        answer['findings'][0]['evidenceEventIds'] = ['not-in-input']
        self.assertTrue(inspect(row, json.dumps(answer))['reference_errors'])

    def test_wrong_session_evidence_is_not_passed(self):
        row = ROWS[5]
        answer = json.loads(row['messages'][2]['content'])
        answer['sessionAssessments'][0]['evidenceEventIds'] = answer['sessionAssessments'][1]['evidenceEventIds']
        self.assertIn('assessment:event_from_other_session', inspect(row, json.dumps(answer))['reference_errors'])

    def test_truncated_or_duplicate_key_json_is_not_passed(self):
        for text in ('{"summary":', '{"summary":"a","summary":"b"}', '```json\n{}\n```'):
            self.assertFalse(inspect(ROWS[0], text)['json_object'])

    def test_boolean_difficulty_is_not_an_integer_setting(self):
        row = ROWS[0]
        answer = json.loads(row['messages'][2]['content'])
        answer['practicePlan']['recommendedDifficulty'] = True
        self.assertIn('plan_recommendedDifficulty', inspect(row, json.dumps(answer))['schema_errors'])


if __name__ == '__main__':
    unittest.main()
