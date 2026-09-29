#!/usr/bin/env python3
"""Structural audit of native model responses, separate from authored-label comparison."""
import argparse,json,statistics
from pathlib import Path
from check_baseline import inspect,parse
from prepare_contract import FINDING_FIELDS,ASSESSMENT_FIELDS,PLAN_FIELDS

def expand(raw):
    x=parse(raw)
    if not isinstance(x,dict):raise ValueError('not_object')
    if set(x)!=set('sfaupc'):raise ValueError('compact_top_level_fields')
    for name,fields in [('f',FINDING_FIELDS),('a',ASSESSMENT_FIELDS)]:
        if not isinstance(x[name],list) or any(not isinstance(v,list) or len(v)!=len(fields) for v in x[name]):raise ValueError('compact_'+name+'_row_length')
    if not isinstance(x['p'],list) or len(x['p'])!=len(PLAN_FIELDS):raise ValueError('compact_plan_length')
    return {'summary':x['s'],'findings':[dict(zip(FINDING_FIELDS,v)) for v in x['f']],
       'sessionAssessments':[dict(zip(ASSESSMENT_FIELDS,v)) for v in x['a']],
       'uncertainties':x['u'],'practicePlan':dict(zip(PLAN_FIELDS,x['p'])),'usedEvidenceCardIds':x['c']}

def normalized_for_check(row):
    p=json.loads(row['messages'][1]['content'])
    if row['task']=='profile_update':
        events=[{'id':e,'sessionId':None} for e in p['allowedEvidenceEventIds']];sessions=[]
        expected=parse(row['messages'][2]['content'])
    else:
        expected=expand(row['messages'][2]['content']);sessions=[{'sessionId':a['sessionId']} for a in expected['sessionAssessments']]
        # References in the actual prompt identify the input, not only the target subset.
        x=json.loads((Path(__file__).parent/'native-v2/expanded-inputs'/f"{row['id']}.json").read_text())
        events=[{'id':e['behaviorLogId'],'sessionId':s['sessionId']} for s in x['behaviorTimeline']['sessions'] for e in s['events']]
    clone={**row,'messages':[{}, {'content':json.dumps({'sourceEventDetails':events,'taskContext':sessions,'evidenceCards':[]})},{'content':json.dumps(expected)}]}
    return clone

def inspect_native(row,raw):
    output=expand(raw) if row['task']=='session_analysis' else parse(raw)
    result=inspect(normalized_for_check(row),json.dumps(output,ensure_ascii=False))
    # Also required by the production validator: an existing finding must be
    # targeted by the plan. This is structural integrity, not a behavior judgment.
    if output.get('findings') and not output.get('practicePlan',{}).get('targetFindingIds'):
        result['reference_errors'].append('plan_missing_target_for_existing_findings')
    return output,result

def main(folder):
    rows=list(map(json.loads,(folder/'eval.frozen.jsonl').read_text().splitlines()));results=[];review=[]
    for r in rows:
        p=folder/'responses'/f"{r['id']}.json"
        if not p.exists():continue
        saved=json.loads(p.read_text());item={k:saved.get(k) for k in ['id','task','status','http_status','wall_seconds']}
        if saved['status']=='response_received':
            try:
                env=json.loads(saved['response_body']);raw=env['message']['content']
                for k in ['prompt_eval_count','eval_count','done_reason','model']:item[k]=env.get(k)
                for k in ['load_duration','prompt_eval_duration','eval_duration','total_duration']:item[k+'_seconds']=env.get(k,0)/1e9
                item['output_complete']=env.get('done_reason')!='length'
                # Preserve malformed responses in the human-readable artifact too.
                review += [f"## {r['id']} · {r['task']} · {item['wall_seconds']}초",'', '```json',raw,'```','']
                output,checked=inspect_native(r,raw);item.update(checked)
            except (ValueError,KeyError,TypeError) as e:item['parse_error']=str(e)
        results.append(item)
    summary={}
    for task in ['session_analysis','profile_update']:
        rs=[r for r in results if r['task']==task];times=[r['wall_seconds'] for r in rs if r['status']=='response_received']
        summary[task]={'attempted':len(rs),'http_200':sum(r.get('http_status')==200 for r in rs),
          'structure_pass':sum(r.get('json_object',False) and not r['schema_errors'] and not r['reference_errors'] for r in rs),
          'median_seconds':statistics.median(times) if times else None,'total_seconds':sum(times),
          'authored_judgment_matches':sum(r.get('reference_label_matches',0) for r in rs),'authored_judgment_count':sum(r.get('reference_label_count',0) for r in rs)}
    (folder/'structural-results.json').write_text(json.dumps({'summary':summary,'cases':results},ensure_ascii=False,indent=2)+'\n')
    (folder/'model-responses.ko.md').write_text('# 새 운영 형식 기준 응답 원문\n\n실제 모델 응답이며 정답이나 전문가 검증 결과가 아니다.\n\n'+'\n'.join(review))
    print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);main(p.parse_args().folder)
