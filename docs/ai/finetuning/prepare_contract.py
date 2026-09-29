#!/usr/bin/env python3
"""Offline contract migration. Never infer missing observations or training approval.

All 85 original cases remain in the manifest. Only a deliberately small, supported
subset is mapped into production DTO fixtures; unsupported fields block a whole
case instead of silently disappearing. Compact targets are transport previews,
not an approved training dataset.
"""
import copy
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / 'contract-v1'
BASE_KEYS = {'inputVersion', 'task', 'dataOrigin', 'taskContext', 'sourceEventDetails',
             'evidenceCards', 'eventSemantics', 'practiceCapabilities', 'outputContract'}
CONTEXT_KEYS = {'sessionId', 'target', 'budget', 'coverage', 'day'}
COMMON = {'id', 'sessionId', 'sequence', 'type', 'timeMs'}
EVENTS = {
    'quantity_changed': ('SHOP.QUANTITY_CHANGED', {'item', 'before', 'after'}),
    'submission': ('SHOP.CHECKOUT_SUBMITTED', {'cart', 'total'}),
    'cart_opened': ('SHOP.CART_OPENED', {'cart'}),
    'cart_closed': ('SHOP.CART_CLOSED', set()),
    'started': ('SHOP.SESSION_STARTED', set()),
    'ended': ('SHOP.SESSION_ENDED', {'reason'}),
}
FINDING_FIELDS = ['id', 'skill', 'observation', 'interpretation', 'alternativeExplanations', 'evidenceEventIds', 'suggestedSupport']
ASSESSMENT_FIELDS = ['sessionId', 'judgment', 'explanation', 'evidenceEventIds']
PLAN_FIELDS = ['targetFindingIds', 'goal', 'rationale', 'recommendedDifficulty', 'itemCount', 'quantityComplexity', 'budgetPressure', 'textSupport', 'reasonCodes']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def aliases(payload):
    result = {}
    number = 0
    for i, context in enumerate(payload['taskContext'], 1):
        result[context['sessionId']] = f'S{i}'
        for event in payload['sourceEventDetails']:
            if event['sessionId'] == context['sessionId']:
                number += 1
                result[event['id']] = f'E{number}'
    return result


def compact_target(row):
    """Keep authored wording/judgments, replace only structured reference values.

    Cards are not supplied on the selected production whole-source FINAL path.
    Their removal is an explicit pending semantic review, never rights clearance.
    """
    payload = json.loads(row['messages'][1]['content'])
    target = json.loads(row['messages'][2]['content'])
    mapping = aliases(payload)
    for f in target['findings']:
        f['evidenceEventIds'] = [mapping[x] for x in f['evidenceEventIds']]
    for a in target['sessionAssessments']:
        a['sessionId'] = mapping[a['sessionId']]
        a['evidenceEventIds'] = [mapping[x] for x in a['evidenceEventIds']]
    removed = target['usedEvidenceCardIds']
    target['usedEvidenceCardIds'] = []
    compact = {'s': target['summary'], 'f': [[f[k] for k in FINDING_FIELDS] for f in target['findings']],
               'a': [[a[k] for k in ASSESSMENT_FIELDS] for a in target['sessionAssessments']],
               'u': target['uncertainties'], 'p': [target['practicePlan'][k] for k in PLAN_FIELDS], 'c': []}
    return compact, removed


def mapping_issues(row):
    if row['task'] != 'session_analysis':
        p = json.loads(row['messages'][1]['content'])
        answer = json.loads(row['messages'][2]['content'])
        allowed = set()
        for analysis in (p['previousProfile'], p['currentAnalysis']):
            for f in analysis.get('findings', []) + analysis.get('sessionAssessments', []):
                allowed.update(f.get('evidenceEventIds', []))
        requested = {e for f in answer['findings'] for e in f['evidenceEventIds']}
        problems = ['PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards']
        if requested - allowed:
            problems.append('PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:' + str(len(requested - allowed)))
        missing = {'summary', 'findings', 'uncertainties', 'practicePlan', 'usedEvidenceCardIds'} - set(p['previousProfile'])
        if missing:
            problems.append('PROFILE_PREVIOUS_FIELDS_MISSING:' + ','.join(sorted(missing)))
        return problems
    p = json.loads(row['messages'][1]['content'])
    issues = ['UNMAPPED_INPUT_FIELD:' + k for k in sorted(set(p) - BASE_KEYS)]
    for c in p['taskContext']:
        issues += ['UNMAPPED_CONTEXT_FIELD:' + k for k in sorted(set(c) - CONTEXT_KEYS)]
        if c['coverage'] != 'COMPLETE':
            issues.append('PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity')
        if not c['target']:
            issues.append('MISSING_GOAL_REQUIRES_REAUTHORING')
    for e in p['sourceEventDetails']:
        if e['type'] not in EVENTS:
            issues.append('UNMAPPED_EVENT_TYPE:' + e['type'])
            continue
        _, fields = EVENTS[e['type']]
        issues += ['UNMAPPED_EVENT_FIELD:' + e['type'] + '.' + k for k in sorted(set(e) - COMMON - fields)]
        if e['type'] == 'ended' and e.get('reason') != 'USER_ABORTED':
            issues.append('UNMAPPED_END_REASON:' + str(e.get('reason')))
    if row['id'] == 'T47':
        issues.append('LABEL_POLICY_PENDING_FROM_CONTENT_REVIEW')
    return sorted(set(issues))


def fixture(row):
    """Minimal partial scene DTO; no current catalog, new event, price, or actor.

    Snapshot metadata carries a provided goal onto the first existing event.
    Missing times use coincident synthetic transport timestamps, NOT inferred
    task duration. This is documented in the manifest, not taught as behavior.
    """
    issues = mapping_issues(row)
    if issues:
        raise ValueError('UNSUPPORTED_SEED_CASE: ' + row['id'])
    p = json.loads(row['messages'][1]['content'])
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    sessions = []
    for c in p['taskContext']:
        start = base + timedelta(days=c.get('day', 0))
        iso = lambda dt: dt.isoformat().replace('+00:00', 'Z')
        events = []
        for e in p['sourceEventDetails']:
            if e['sessionId'] != c['sessionId']:
                continue
            ms = e.get('timeMs', 0)
            body = {'type': 'SHOPPING'}
            if 'cart' in e:
                body['marketContent'] = {'cart': copy.deepcopy(e['cart'])}
            if 'total' in e:
                body['cartTotalAmount'] = e['total']
            if e['type'] == 'quantity_changed':
                body.update(itemId=e['item'], quantityBefore=e['before'], quantityAfter=e['after'])
            if not events:
                # Product labels are stable synthetic IDs here, not current catalog SKUs.
                body.setdefault('marketContent', {})['sceneSnapshot'] = {'mission': {
                    'budget': c['budget'], 'objectives': [
                        {'productId': k, 'quantity': v, 'label': k} for k, v in c['target'].items()]}}
            event = {'behaviorLogId': e['id'], 'sequence': e['sequence'],
                     'occurredAt': iso(start + timedelta(milliseconds=ms)),
                     'receivedAt': iso(start + timedelta(milliseconds=ms)),
                     'elapsedFromSessionStartMs': ms,
                     'eventSchemaVersion': 'synthetic-contract-fixture-v1',
                     'action': {'eventCode': EVENTS[e['type']][0]}, 'payload': body}
            if e['type'] == 'ended':
                event['sessionEnd'] = {'reason': e['reason']}
            events.append(event)
        sessions.append({'sessionId': c['sessionId'], 'startedAt': iso(start),
                         'endedAt': None, 'integrity': None, 'events': events})
    dataset_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'oneuldo-contract-v1/' + row['id']))
    timeline = {'schemaVersion': 'synthetic-contract-fixture-v1', 'datasetId': dataset_id,
                'generatedAt': '2026-01-01T00:00:00Z', 'analysisWindow': None,
                'anonymousSubjectId': row['id'] + '-synthetic',
                'sessionCount': len(sessions), 'eventCount': len(p['sourceEventDetails']), 'sessions': sessions}
    return {'id': dataset_id, 'schemaVersion': timeline['schemaVersion'], 'generatedAt': timeline['generatedAt'],
            'sessionCount': timeline['sessionCount'], 'eventCount': timeline['eventCount'], 'input': timeline}


def main():
    OUT.mkdir(exist_ok=True)
    (OUT/'inputs').mkdir(exist_ok=True)
    cases, targets, hashes = [], [], {}
    for split in ('train', 'eval'):
        path = HERE/'seed-v1'/f'{split}.draft.jsonl'
        hashes[split] = digest(path.read_bytes())
        for row in map(json.loads, path.read_text().splitlines()):
            issues = mapping_issues(row)
            record = {'id': row['id'], 'split': split, 'task': row['task'], 'title': row['title'],
                      'input_mapping_issues': issues, 'training_approved': False,
                      'source_review': row['review'], 'native_fixture': not issues}
            if row['task'] == 'session_analysis':
                target, removed = compact_target(row)
                targets.append({'id': row['id'], 'split': split, 'compact_target': target})
                record['removed_output_card_ids'] = removed
                record['target_status'] = 'TRANSPORT_PREVIEW_REQUIRES_SEMANTIC_REVIEW'
            if not issues:
                dump(OUT/'inputs'/f"{row['id']}.json", fixture(row))
            cases.append(record)
    (OUT/'compact-targets.preview.jsonl').write_text(''.join(json.dumps(x, ensure_ascii=False)+'\n' for x in targets))
    manifest = {'version': 1, 'stage': 'WHOLE_SOURCE_FINAL_DRAFT', 'training_approved': False,
                'source_sha256': hashes, 'original_train_count': 60, 'original_eval_count': 25,
                'fixtures_are_synthetic': True, 'runtime_or_server_changes': False,
                'fixture_limits': ['Only existing event IDs/order and supplied goal/cart/quantity values are mapped.',
                                  'COMPLETE does not populate SessionIntegrity; integrity is null.',
                                  'Native fixture is a provided-event excerpt, not proof of whole-play coverage.',
                                  'Missing event times use coincident synthetic transport timestamps; not observed durations.',
                                  'Partial scene goal is attached to first existing event; no new start/submit/finish event.',
                                  'Product labels remain synthetic IDs; no current prices/catalog are substituted.',
                                  'Output cards omitted because chosen production path supplies no cards; semantic review still pending.',
                                  'Profile/review/observation training is outside this stage; no silent mixing.'],
                'cases': cases}
    dump(OUT/'migration-manifest.json', manifest)
    print(json.dumps({'cases': len(cases), 'compact_target_previews': len(targets),
                      'native_fixture_ids': [x['id'] for x in cases if x['native_fixture']],
                      'training_approved': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
