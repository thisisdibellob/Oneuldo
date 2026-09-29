import copy
import json
import unittest
from pathlib import Path

import prepare_contract as tool


class ContractMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = {}
        for split in ('train', 'eval'):
            for row in map(json.loads, (tool.HERE/'seed-v1'/f'{split}.draft.jsonl').read_text().splitlines()):
                cls.rows[row['id']] = row

    def changed(self, id, edit):
        row = copy.deepcopy(self.rows[id])
        p = json.loads(row['messages'][1]['content'])
        edit(p)
        row['messages'][1]['content'] = json.dumps(p, ensure_ascii=False)
        return row

    def test_unknown_context_is_not_silently_dropped(self):
        row = self.changed('T01', lambda p: p['taskContext'][0].update(actor='facilitator'))
        self.assertTrue(any('actor' in x for x in tool.mapping_issues(row)))
        with self.assertRaises(ValueError):
            tool.fixture(row)

    def test_event_actor_and_automatic_trigger_require_a_real_mapping(self):
        row = self.changed('T01', lambda p: p['sourceEventDetails'][0].update(actor='facilitator'))
        with self.assertRaises(ValueError):
            tool.fixture(row)
        with self.assertRaises(ValueError):
            tool.fixture(self.rows['T44'])

    def test_partial_coverage_is_not_laundered_into_transport_completeness(self):
        with self.assertRaises(ValueError):
            tool.fixture(self.rows['T06'])
        native = tool.fixture(self.rows['T01'])
        self.assertIsNone(native['input']['sessions'][0]['integrity'])

    def test_new_goal_is_not_replaced_by_previous_goal(self):
        row = self.changed('E06', lambda p: p['taskContext'][1].update(target={'바나나': 3, '요거트': 2}))
        source = copy.deepcopy(row)
        native = tool.fixture(row)
        sessions = native['input']['sessions']
        goals = [s['events'][0]['payload']['marketContent']['sceneSnapshot']['mission']['objectives'] for s in sessions]
        self.assertEqual(goals[0][0]['quantity'], 2)
        self.assertEqual(goals[1][0]['quantity'], 3)
        self.assertEqual(row, source)
        self.assertEqual(sessions[1]['startedAt'], '2026-01-15T00:00:00Z')

    def test_profile_requires_other_evidence_path(self):
        profiles = [r for r in self.rows.values() if r['task'] == 'profile_update']
        self.assertEqual(len(profiles), 28)
        for row in profiles:
            self.assertTrue(tool.mapping_issues(row)[0].startswith('PROFILE_STAGE_SEPARATE'))
            with self.assertRaises(ValueError):
                tool.fixture(row)

    def test_target_transport_does_not_mutate_source_or_compute_judgments(self):
        row = copy.deepcopy(self.rows['T01'])
        before = copy.deepcopy(row)
        original = json.loads(row['messages'][2]['content'])
        compact, removed = tool.compact_target(row)
        self.assertEqual(row, before)
        self.assertEqual(compact['a'][0][1], original['sessionAssessments'][0]['judgment'])
        self.assertEqual(compact['f'][0][2], original['findings'][0]['observation'])
        self.assertEqual(removed, original['usedEvidenceCardIds'])
        self.assertEqual(compact['c'], [])
        self.assertEqual(compact['f'][0][5], ['E1', 'E2', 'E3'])


if __name__ == '__main__':
    unittest.main()
