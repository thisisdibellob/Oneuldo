"""Structural and provenance QA only; does not grade clinical or behavioral truth."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from uuid import UUID

HERE = Path(__file__).resolve().parent
errors = []
checks = Counter()

def check(condition, message, kind):
    checks[kind] += 1
    if not condition:
        errors.append(message)

def read(split):
    return [json.loads(line) for line in (HERE / f'{split}.draft.jsonl').read_text().splitlines()]

def validate():
    errors.clear()
    checks.clear()
    train, evaluation = read('train'), read('eval')
    check(len(train)==60 and len(evaluation)==25, 'Expected 60 training and 25 evaluation drafts', 'counts')
    check(Counter(x['task'] for x in train)=={'session_analysis':40,'profile_update':20}, 'Training task balance', 'counts')
    check(Counter(x['task'] for x in evaluation)=={'session_analysis':17,'profile_update':8}, 'Evaluation task balance', 'counts')
    check([r['id'] for r in train]==[f'T{i:02}' for i in range(1,61)], 'Training IDs/order', 'counts')
    check([r['id'] for r in evaluation]==[f'E{i:02}' for i in range(1,26)], 'Evaluation IDs/order', 'counts')
    check(all(r['split']=='train' for r in train) and all(r['split']=='eval' for r in evaluation), 'Incorrect split field', 'split')
    rows = train + evaluation
    check(len({r['id'] for r in rows}) == len(rows), 'Duplicate IDs', 'uniqueness')
    train_sources = {s for r in train for s in r['provenance']['source_ids']}
    eval_sources = {s for r in evaluation for s in r['provenance']['source_ids']}
    check(not train_sources & eval_sources, 'Source ID overlap across splits', 'split')
    for key in ('scenario_family','participant_group'):
        check(not {r['provenance'][key] for r in train} & {r['provenance'][key] for r in evaluation}, f'{key} overlap', 'split')
    check(not {s for r in train for s in r['provenance']['session_ids']} & {s for r in evaluation for s in r['provenance']['session_ids']}, 'Session overlap', 'split')
    input_hashes = [hashlib.sha256(r['messages'][1]['content'].encode()).hexdigest() for r in rows]
    check(len(set(input_hashes))==len(input_hashes), 'Exact duplicate inputs', 'uniqueness')
    # Ignore generated UUIDs when checking identical observed situations. This is not a semantic similarity test.
    def situation_key(row):
        payload=json.loads(row['messages'][1]['content'])
        contexts=[{k:v for k,v in s.items() if k!='sessionId'} for s in payload['taskContext']]
        session_index={s['sessionId']:i for i,s in enumerate(payload['taskContext'])}
        events=[{k:v for k,v in e.items() if k not in ('id','sessionId')} | {'session':session_index[e['sessionId']]}
                for e in payload['sourceEventDetails']]
        return json.dumps({'contexts':contexts,'events':events},ensure_ascii=False,sort_keys=True)
    train_situations={situation_key(r) for r in train}
    check(not train_situations & {situation_key(r) for r in evaluation}, 'Identical observed situation across splits ignoring UUIDs', 'split')
    source_cards = {c['card_id']: c for c in json.loads((HERE/'source-cards.json').read_text())}
    card_urls = {split: {source_cards[s]['source_url'] for r in records for s in r['provenance']['source_ids']}
                 for split, records in [('train',train),('eval',evaluation)]}
    check(not card_urls['train'] & card_urls['eval'], 'Same source URL under distinct IDs', 'split')
    for r in rows:
        rid=r['id']; p=json.loads(r['messages'][1]['content']); o=json.loads(r['messages'][2]['content'])
        check([m['role'] for m in r['messages']] == ['system','user','assistant'], rid+' message roles', 'messages')
        check(r['review']=={'status':'draft','domain_expert_reviewed':False,'source_rights_reviewed':False,'training_approved':False}, rid+' draft status', 'provenance')
        check(r['provenance']['real_participant_data'] is False, rid+' synthetic origin', 'provenance')
        check(bool(r['rubric']['must_include']) and bool(r['rubric']['must_not_claim']),rid+' missing rubric','rubric')
        sessions={s['sessionId'] for s in p['taskContext']}
        events={e['id']:e for e in p['sourceEventDetails']}
        check(len(events)==len(p['sourceEventDetails']),rid+' duplicate events','references')
        for identity in sessions | set(events):
            try: UUID(identity)
            except ValueError: errors.append(rid+' invalid UUID '+identity)
        check(all(e['sessionId'] in sessions for e in events.values()),rid+' event session','references')
        for sid in sessions:
            seq=[e['sequence'] for e in events.values() if e['sessionId']==sid]
            check(seq==list(range(1,len(seq)+1)),rid+' sequence','references')
        fields={'summary','findings','uncertainties','practicePlan','usedEvidenceCardIds'}
        if r['task']=='session_analysis': fields.add('sessionAssessments')
        check(set(o)==fields,rid+' output fields','schema')
        check(isinstance(o['summary'],str) and bool(o['summary']),rid+' summary','schema')
        check(isinstance(o['uncertainties'],list) and all(isinstance(x,str) for x in o['uncertainties']),rid+' uncertainties','schema')
        check(0<=len(o['findings'])<=12,rid+' finding count','schema')
        fids={f['id'] for f in o['findings']}
        check(len(fids)==len(o['findings']),rid+' duplicate finding IDs','references')
        for f in o['findings']:
            check(set(f)=={'id','skill','observation','interpretation','alternativeExplanations','evidenceEventIds','suggestedSupport'},rid+' finding fields','schema')
            for key in ('id','skill','observation','interpretation','suggestedSupport'):
                check(isinstance(f[key],str) and bool(f[key]),rid+' finding '+key,'schema')
            check(bool(f['evidenceEventIds']) and set(f['evidenceEventIds']) <= set(events),rid+' finding citations','references')
            check(isinstance(f['alternativeExplanations'],list) and all(isinstance(a,str) for a in f['alternativeExplanations']),rid+' alternative array','schema')
        if r['task']=='session_analysis':
            check(len(o['sessionAssessments'])==len(sessions) and {a['sessionId'] for a in o['sessionAssessments']}==sessions,rid+' assessment coverage','references')
            for a in o['sessionAssessments']:
                check(a['judgment'] in ('SUCCESS','FAILURE','UNDETERMINED'),rid+' judgment enum','schema')
                check(bool(a['evidenceEventIds']) and all(e in events and events[e]['sessionId']==a['sessionId'] for e in a['evidenceEventIds']),rid+' cross-session citation','references')
        else:
            check(p['sameSessionReanalysis']==(p['previousSourceSessionId']==p['taskContext'][-1]['sessionId']),rid+' reanalysis flag','references')
            check('currentAnalysis' in p and p['currentAnalysis'] != o,rid+' current/updated profile distinction','schema')
            check(all(len(f['evidenceEventIds'])<=3 for f in o['findings']),rid+' profile reference count','references')
        plan=o['practicePlan']
        check(set(plan)=={'targetFindingIds','goal','rationale','recommendedDifficulty','itemCount','quantityComplexity','budgetPressure','textSupport','reasonCodes'},rid+' plan fields','schema')
        check(set(plan['targetFindingIds'])<=fids,rid+' plan finding refs','references')
        if not fids:
            check(plan['targetFindingIds']==[] and bool(o['uncertainties']),rid+' empty findings contract','schema')
        check(plan['itemCount'] in (2,3,4) and plan['recommendedDifficulty'] in (1,2,3),rid+' game limits','capabilities')
        check(plan['quantityComplexity'] in ('LOW','MEDIUM','HIGH') and plan['budgetPressure'] in ('LOW','MEDIUM','HIGH'),rid+' plan enums','schema')
        check(plan['textSupport'] in ('SIMPLIFIED','STANDARD','REDUCED'),rid+' text support','schema')
        check(1<=len(plan['reasonCodes'])<=8 and all(re.fullmatch('[A-Z0-9_]{2,50}',c) for c in plan['reasonCodes']),rid+' reason codes','schema')
        # Only explicit item-count wording is checked, never ability or success inferred.
        for text in [plan['goal']]+[f['suggestedSupport'] for f in o['findings']]:
            for n in re.findall(r'(\d+)개 품목',text):
                check(int(n)==plan['itemCount'],rid+' prose vs itemCount','capabilities')
        provided={c['card_id'] for c in p['evidenceCards']}
        check(set(o['usedEvidenceCardIds'])<=provided and provided==set(r['provenance']['source_ids']),rid+' card references','sources')
        for c in p['evidenceCards']:
            check(c==source_cards[c['card_id']],rid+' card consistency','sources')
            check(c['source_url'].startswith('https://') and bool(c['read_scope']) and bool(c['source_limitations_ko']),rid+' card provenance','sources')
            check(not c['expert_validated'] and not c['fine_tuning_training_approved'],rid+' card draft flags','sources')
    report={'status':'PASS' if not errors else 'FAIL','scope':'구조·참조·출처/세션 분리·게임 실행 범위 검사. 의미 타당성·전문가 검토·학습 품질 검증 아님.',
            'training_cases':len(train),'evaluation_cases':len(evaluation),
            'task_counts':{'train':dict(Counter(r['task'] for r in train)),
                           'eval':dict(Counter(r['task'] for r in evaluation))}, 'checks':dict(checks),
            'train_source_ids':sorted(train_sources),'eval_source_ids':sorted(eval_sources),
            'training_approved_cases':sum(r['review']['training_approved'] for r in rows),
            'errors':errors}
    (HERE/'validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return not errors

if __name__=='__main__':
    raise SystemExit(0 if validate() else 1)
