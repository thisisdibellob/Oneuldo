#!/usr/bin/env python3
"""Inspect syntax, schema and reference integrity; never grade a person's ability.

Reference-label agreement is a comparison with authored draft answers, not a truth
score. Semantic adequacy must be reviewed separately against each frozen input.
"""
import argparse
import json
import statistics
from pathlib import Path


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_json_key')
        result[key] = value
    return result


def parse(text):
    return json.loads(text, object_pairs_hook=unique_object,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError('nonfinite_number')))


def inspect(row, text):
    result = {'json_object': False, 'schema_errors': [], 'reference_errors': [],
              'reference_label_matches': 0, 'reference_label_count': 0}
    try:
        output = parse(text)
        if not isinstance(output, dict):
            raise ValueError('not_object')
    except (ValueError, TypeError):
        result['schema_errors'].append('not_a_strict_json_object')
        return result
    result['json_object'] = True
    payload = json.loads(row['messages'][1]['content'])
    expected = json.loads(row['messages'][2]['content'])
    events = {e['id']: e for e in payload['sourceEventDetails']}
    sessions = {s['sessionId'] for s in payload['taskContext']}
    schema, refs = result['schema_errors'], result['reference_errors']

    def nonempty_string(value):
        return isinstance(value, str) and bool(value.strip())

    def strings(value):
        return isinstance(value, list) and all(isinstance(x, str) for x in value)

    def citations(value, where, sid=None):
        if not strings(value) or not value:
            refs.append(where + ':missing_or_invalid_event_refs')
            return
        if len(set(value)) != len(value):
            refs.append(where + ':duplicate_event_refs')
        for eid in value:
            if eid not in events:
                refs.append(where + ':unknown_event_id')
            elif sid is not None and events[eid]['sessionId'] != sid:
                refs.append(where + ':event_from_other_session')

    if set(output) != set(expected):
        schema.append('top_level_fields')
    if not nonempty_string(output.get('summary')):
        schema.append('summary')
    if not strings(output.get('uncertainties')):
        schema.append('uncertainties')
    findings = output.get('findings')
    if not isinstance(findings, list) or len(findings) > 12:
        schema.append('findings_array')
        findings = []
    ids = []
    for index, finding in enumerate(findings):
        where = 'finding_' + str(index+1)
        if not isinstance(finding, dict):
            schema.append(where + ':object')
            continue
        if set(finding) != {'id', 'skill', 'observation', 'interpretation', 'alternativeExplanations', 'evidenceEventIds', 'suggestedSupport'}:
            schema.append(where + ':fields')
        for key in ('id', 'skill', 'observation', 'interpretation', 'suggestedSupport'):
            if not nonempty_string(finding.get(key)):
                schema.append(where + ':' + key)
        if isinstance(finding.get('id'), str):
            ids.append(finding['id'])
        if not strings(finding.get('alternativeExplanations')):
            schema.append(where + ':alternatives')
        citations(finding.get('evidenceEventIds'), where)
        if row['task'] == 'profile_update' and isinstance(finding.get('evidenceEventIds'), list) and len(finding['evidenceEventIds']) > 3:
            refs.append(where + ':profile_more_than_3_refs')
    if len(set(ids)) != len(ids):
        refs.append('duplicate_finding_ids')
    plan = output.get('practicePlan')
    if not isinstance(plan, dict):
        schema.append('practicePlan')
    else:
        if set(plan) != set(expected['practicePlan']):
            schema.append('plan_fields')
        for key in ('goal', 'rationale'):
            if not nonempty_string(plan.get(key)):
                schema.append('plan_' + key)
        for key, allowed in [('itemCount', (2, 3, 4)), ('recommendedDifficulty', (1, 2, 3))]:
            if type(plan.get(key)) is not int or plan[key] not in allowed:
                schema.append('plan_' + key)
        for key, allowed in [('quantityComplexity', ('LOW', 'MEDIUM', 'HIGH')), ('budgetPressure', ('LOW', 'MEDIUM', 'HIGH')), ('textSupport', ('SIMPLIFIED', 'STANDARD', 'REDUCED'))]:
            if plan.get(key) not in allowed:
                schema.append('plan_' + key)
        if not strings(plan.get('reasonCodes')) or not plan['reasonCodes']:
            schema.append('plan_reasonCodes')
        if not strings(plan.get('targetFindingIds')) or not set(plan['targetFindingIds']) <= set(ids):
            refs.append('plan_unknown_finding')
    used = output.get('usedEvidenceCardIds')
    provided = {c['card_id'] for c in payload['evidenceCards']}
    if not strings(used) or not set(used) <= provided:
        refs.append('unknown_source_card')
    if row['task'] == 'session_analysis':
        assessments = output.get('sessionAssessments')
        if not isinstance(assessments, list):
            schema.append('assessments_array')
            assessments = []
        actual = {}
        for item in assessments:
            if not isinstance(item, dict):
                schema.append('assessment_object')
                continue
            if set(item) != {'sessionId', 'judgment', 'explanation', 'evidenceEventIds'}:
                schema.append('assessment_fields')
            sid = item.get('sessionId')
            if not isinstance(sid, str) or sid not in sessions:
                refs.append('assessment_unknown_session')
                sid = None
            if sid in actual:
                refs.append('assessment_duplicate_session')
            actual[sid] = item.get('judgment')
            if item.get('judgment') not in ('SUCCESS', 'FAILURE', 'UNDETERMINED') or not nonempty_string(item.get('explanation')):
                schema.append('assessment_value')
            citations(item.get('evidenceEventIds'), 'assessment', sid)
        if set(actual) != sessions:
            refs.append('assessment_session_coverage')
        reference = {a['sessionId']: a['judgment'] for a in expected['sessionAssessments']}
        result['reference_label_count'] = len(reference)
        result['reference_label_matches'] = sum(actual.get(sid) == label for sid, label in reference.items())
    return result


def summarize(folder):
    rows = [json.loads(x) for x in (folder/'eval.frozen.jsonl').read_text().splitlines()]
    results = []
    for row in rows:
        path = folder/'responses'/(row['id']+'.json')
        if not path.exists():
            continue
        saved = json.loads(path.read_text())
        item = {k: saved.get(k) for k in ('id', 'task', 'status', 'http_status', 'wall_seconds')}
        if saved['status'] == 'response_received':
            try:
                envelope = json.loads(saved['response_body'])
                text = envelope['message']['content']
                item.update(inspect(row, text))
                item['done_reason'] = envelope.get('done_reason')
                for key in ('total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration'):
                    item[key+'_seconds'] = envelope.get(key, 0)/1e9
                for key in ('prompt_eval_count', 'eval_count'):
                    item[key] = envelope.get(key)
                item['response_model'] = envelope.get('model')
            except (ValueError, KeyError, TypeError):
                item['envelope_error'] = True
        results.append(item)
    successful = [x for x in results if x.get('json_object')]
    times = [x['wall_seconds'] for x in results if x['status'] == 'response_received']
    summary = {'attempted': len(results), 'total_cases': len(rows),
               'http_200': len(times), 'json_objects': len(successful),
               'schema_and_reference_pass': sum(not x['schema_errors'] and not x['reference_errors'] for x in successful),
               'truncated_responses': sum(x.get('done_reason') == 'length' for x in results),
               'reference_label_matches': sum(x.get('reference_label_matches', 0) for x in results),
               'reference_label_count_for_parsed_responses': sum(x.get('reference_label_count', 0) for x in results),
               'wall_seconds_sum': round(sum(times), 3),
               'wall_seconds_median': round(statistics.median(times), 3) if times else None,
               'wall_seconds_min': min(times) if times else None, 'wall_seconds_max': max(times) if times else None,
               'semantic_review': 'NOT_AUTOMATICALLY_GRADED',
               'cases': results}
    (folder/'structural-results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='cases'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent/'baseline-v1')
    summarize(parser.parse_args().out)
