#!/usr/bin/env python3
"""Author new synthetic training cases, keeping the entire v2/evaluation frozen.

This is offline fixture construction, not a runtime decision/rule engine.
Judgments and plans below are authored proposals, not clinical ground truth.
"""
import copy,hashlib,json,shutil,uuid
from pathlib import Path
from build_native_v2 import session_fixture,cart_text,finding,plan
HERE=Path(__file__).resolve().parent
OLD=HERE/'native-v2';OUT=HERE/'native-v3'
def uid(s):return str(uuid.uuid5(uuid.NAMESPACE_URL,'oneuldo-native-v3/'+s))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
# id, target quantities, budget, event pattern, authored outcome, quantity,
# budget, difficulty, authored interpretation (never derived from target answer).
SPECS=[
 ('T01',[1,1,1],7000,'submit','SUCCESS','LOW','LOW',2,'세 종류를 각 1개씩 제출한 수행을 유지해 관찰한다.'),
 ('T02',[2,1,2],6500,'short','FAILURE','MEDIUM','MEDIUM',2,'첫 품목이 목표보다 1개 적다. 세 종류는 유지하되 수량 대조를 짧게 안내한다.'),
 ('T05',[1,1,1],6500,'selection','UNDETERMINED','LOW','LOW',2,'선택 변화는 있지만 제출은 없어 달성을 보류한다. 세 종류의 단순한 목표를 다시 관찰한다.'),
 ('T06',[1,1,1,1],10000,'cart','UNDETERMINED','LOW','LOW',2,'중간 장바구니와 화면 열기만으로 제출 완료나 읽기 의도를 판단하지 않는다.'),
 ('T08',[1,1,1,1],9000,'slow','SUCCESS','LOW','LOW',2,'소요 시간이 길어도 제출은 목표에 맞는다. 속도를 이유로 네 종류를 줄이지 않는다.'),
 ('T10',[1,2,1],8000,'instruction','SUCCESS','MEDIUM','LOW',2,'안내 화면 이후 목표 제출이 관찰됐다. 화면 제시가 성공의 원인인지는 알 수 없다.'),
 ('T12',[1,1,1,1],8500,'ended','SUCCESS','LOW','MEDIUM',3,'제출 뒤 종료 코드는 앞서 확인한 목표 제출을 뒤집지 않는다.'),
 ('T14',[1,1,1],6000,'partial','UNDETERMINED','LOW','LOW',2,'일부 장바구니 발췌를 최종 실패로 해석하지 않는다.'),
 ('T15',[2,2,1],7000,'correct','SUCCESS','MEDIUM','MEDIUM',2,'수량 변경 뒤 제출은 목표에 맞는다. 변경 의도나 외부 도움은 확인되지 않았다.'),
 ('T16',[1,1,1,1],10000,'instruction','SUCCESS','LOW','LOW',2,'이번 네 종류 제출은 확인됐지만 문자 이해나 안내의 단독 효과를 증명하지 않는다.'),
 ('T19',[1,2,1],6500,'submit','SUCCESS','MEDIUM','MEDIUM',2,'세 종류의 이번 제출을 기록한다. 문헌이나 진단에 대한 개인별 결론을 덧붙이지 않는다.'),
 ('T31',[1,1,1,1],7000,'submit','SUCCESS','LOW','MEDIUM',3,'총액이 예산과 같다. 예산 이하라는 조건에서 동일 금액은 초과가 아니다.'),
 ('T39',[2,1,1],6500,'reopen','SUCCESS','MEDIUM','MEDIUM',2,'장바구니에 같은 수량이 다시 보인 것을 추가 구매로 중복 계산하지 않는다.'),
 ('T43',[1,1,1],6000,'missing','FAILURE','LOW','LOW',2,'선반 열기와 품목 담기는 다르다. 제출에서 마지막 목표 품목이 빠졌다.'),
 ('T44',[1,1,2,1],10000,'reopen','SUCCESS','MEDIUM','LOW',3,'중간 장바구니와 최종 제출이 확인됐다. 화면을 연 동기를 단정하지 않는다.'),
 ('T45',[2,2,2],8500,'submit','SUCCESS','MEDIUM','MEDIUM',2,'세 종류 합계 여섯 단위의 목표를 충족했다. 도움 기록 부재는 무지원 수행의 증명이 아니다.'),
 ('T46',[1,1,1,1],9000,'instruction','SUCCESS','LOW','LOW',2,'안내 뒤 네 종류의 목표 제출을 확인했다. 지원 수락·거절이나 선호를 추측하지 않는다.'),
 ('T49',[1,1,1],7000,'cart','UNDETERMINED','LOW','LOW',2,'중간 장바구니는 목표와 같지만 제출 기록은 없다. 최종 결과는 보류한다.'),
]
PRODUCTS=[('사과',1200),('생수',800),('두부',1500),('우유',3500)]

def make_session(spec):
 i,quantities,budget,kind,judgment,q,b,d,interpretation=spec
 target={name:n for (name,_),n in zip(PRODUCTS,quantities)}
 catalog={name:price for name,price in PRODUCTS[:len(target)]}
 sid=uid(i+'/session');events=[]
 def add(t,**kw):
  n=len(events)+1;events.append(dict(id=uid(i+'/event/'+str(n)),sessionId=sid,sequence=n,timeMs=n*10000,type=t,**kw))
 actual=target.copy()
 if kind=='short':actual['사과']-=1
 if kind=='missing':actual.pop(list(target)[-1]);add('shelf_opened',category='음료')
 if kind=='selection':add('quantity_changed',item='사과',before=0,after=quantities[0])
 elif kind=='partial':add('cart_opened',cart={'사과':1})
 elif kind=='cart':add('cart_opened',cart=actual);add('cart_closed')
 else:
  if kind=='instruction':add('instruction')
  if kind=='correct':add('quantity_changed',item='사과',before=3,after=quantities[0])
  if kind=='reopen':add('cart_opened',cart=actual)
  add('submission',cart=actual,total=sum(catalog[k]*v for k,v in actual.items()))
  if kind=='slow':events[-1]['timeMs']=720000
  if kind=='ended':add('ended',reason='USER_ABORTED')
 source={'taskContext':[{'sessionId':sid,'target':target,'budget':budget,'catalog':catalog,
    'description':'목록의 품목과 수량을 담고 총액을 예산 이하로 제출하세요.','catalogVersion':'synthetic-v3'}],
    'sourceEventDetails':events}
 # The target quantities are feasible; malformed-budget fixtures elsewhere stay intact.
 assert sum(catalog[k]*v for k,v in target.items())<=budget,(i,'infeasible authored task')
 fx=session_fixture(i,source)
 if kind=='selection':obs=f"사과를 0개에서 {quantities[0]}개로 바꾼 기록만 있고 제출은 없다."
 elif kind=='partial':obs='사과 1개가 담긴 장바구니를 연 발췌만 제공됐다.'
 elif kind=='cart':obs=f"{cart_text(actual)} 장바구니를 열고 닫았으며 제출은 제공되지 않았다."
 else:
  obs=f"{cart_text(actual)}를 {sum(catalog[k]*v for k,v in actual.items())}원으로 제출했다."
  obs={'slow':'720초에 ','instruction':'목표 안내 화면 뒤 ','correct':'사과를 3개에서 2개로 바꾼 뒤 ',
       'reopen':'같은 수량의 장바구니를 연 뒤 ','missing':'선반을 연 뒤 '}.get(kind,'')+obs
  if kind=='ended':obs+=' 제출 뒤 USER_ABORTED 종료가 기록됐다.'
 n=len(target)
 text='SIMPLIFIED' if kind in ('short','missing','selection','partial') else 'STANDARD'
 goal=f'{n}종류의 '+('서로 다른 목표 수량' if q=='MEDIUM' else '단순한 목표 수량')+'을 다시 관찰한다.'
 pl=plan(['F1'],(d,n,q,b,text,goal));pl['rationale']=interpretation+' 관찰한 범위의 품목 수를 유지하며 '+('짧은 품명·수량 목록을 제안한다.' if text=='SIMPLIFIED' else '현재 일반 문자 형식을 유지한다.')
 refs=[e['id'] for e in events]
 f=finding('F1',obs,refs,interpretation,goal)
 answer=dict(summary=obs+' '+interpretation,findings=[f],sessionAssessments=[dict(sessionId=sid,judgment=judgment,
    explanation=obs+' '+interpretation,evidenceEventIds=refs)],uncertainties=['다른 환경의 수행·문자 이해·외부 도움 여부는 이 기록만으로 확정할 수 없다.'],practicePlan=pl,usedEvidenceCardIds=[])
 return fx,answer,source

# Independent upstream observations/claims and authored corrections. No eval text read.
PROFILE_SPECS={
 'T25':dict(n=4,previous='목표 사과·생수·두부·우유 각 1개, 예산 9000원에서 각 1개를 7000원에 제출했다.',
   current=['새 세션의 같은 네 종류 목표에서 사과 1개가 든 중간 장바구니만 제공됐고 제출은 없다.'],
   claim='새 세션은 장보기에 완전히 실패했다.',outcome='UNDETERMINED',q='LOW',b='LOW',d=2,text='STANDARD',
   correction='이전의 네 종류 목표 제출은 보존한다. 새 발췌에는 제출이 없어 실패라고 단정한 현재 요약을 보류한다.'),
 'T28':dict(n=3,previous='목표 사과 1개·생수 1개·두부 1개, 예산 6000원에서 목표대로 3500원에 제출했다.',
   current=['같은 세 종류 목표에서 사과·생수·두부 각 1개를 3500원에 제출했다.',
            '보고자 user, 이번 세션 뒤: “계산은 옆에서 도와줬어요. 합계는 아직 잘 모르겠어요. 짧은 목록을 계속 쓰고 싶어요.”'],
   claim='두 번 성공했으므로 혼자 계산하는 능력이 완전히 향상됐다.',outcome='SUCCESS',q='LOW',b='LOW',d=2,text='SIMPLIFIED',
   correction='두 목표 제출은 확인되지만 이번 도움 보고를 보존한다. 혼자 계산을 숙달했다거나 교육 효과가 입증됐다는 해석은 철회한다.'),
 'T29':dict(n=4,previous='이전 입력에는 사과 1개가 든 중간 장바구니만 있으며 제출은 없다.',
   current=['목표 사과·생수·두부·우유 각 1개, 예산 9000원에서 목표대로 7000원에 제출했다.',
            '보고자 user, 이번 세션 뒤: “지금처럼 일반 목록을 보고 싶어요.”'],
   claim='이전부터 언제나 네 물건을 혼자 살 수 있었다.',outcome='SUCCESS',q='LOW',b='LOW',d=2,text='STANDARD',
   correction='이번 네 종류의 제출만 확인한다. 이전 발췌로 과거의 항상 성공이나 무지원 수행을 확정하지 않는다.'),
 'T30':dict(n=3,previous='목표 사과 2개·생수 1개·두부 2개 중 사과 1개·생수 1개·두부 2개를 5000원에 제출했다. 예산은 7000원이었다.',
   current=['같은 세 종류 목표에서 사과 2개·생수 1개·두부 2개를 6200원에 제출했다.',
            '보고자 user: “이번에도 짧은 품명과 수량으로 세 종류를 해보고 싶어요.”'],
   claim='새 세션에서는 목표 수량을 제출했다.',outcome='SUCCESS',q='MEDIUM',b='MEDIUM',d=2,text='SIMPLIFIED',
   correction='이전의 사과 부족과 새 목표 제출을 각각 보존한다. 이번 요청에 맞춰 세 종류와 짧은 목록을 유지하며 수량을 다시 관찰한다.'),
 'T55':dict(n=3,previous='이전 세션은 종료 결과가 유실돼 최종 장바구니를 확인할 수 없다.',
   current=['목표 사과 1개·생수 1개·두부 1개, 예산 6000원에서 목표대로 3500원에 제출했다.',
            '보고자 user: “긴 설명을 줄이고 품명과 수량만 보이는 목록을 다음에도 쓰고 싶어요.”'],
   claim='이전 실패를 극복해 읽기 능력이 회복됐다.',outcome='SUCCESS',q='LOW',b='LOW',d=2,text='REDUCED',
   correction='이전 실패나 읽기 기능 회복은 확인할 수 없다. 이번 제출과 설명을 줄인 목록에 대한 요청을 따로 기록한다.'),
 'T56':dict(n=4,previous='이전 목표는 사과 1개·생수 1개·두부 1개·우유 1개, 예산 10000원이며 7000원으로 목표대로 제출했다.',
   current=['새 목표는 사과 2개·생수 1개·두부 2개·우유 1개, 예산 10000원이며 9700원으로 목표대로 제출했다.',
            '보고자 user: “품명과 수량만 있는 짧은 표시로 다음에도 네 종류를 하고 싶어요.”'],
   claim='열 차례 연속 성공으로 장보기 교육 효과가 증명됐다.',outcome='SUCCESS',q='MEDIUM',b='MEDIUM',d=3,text='REDUCED',
   correction='제공된 것은 서로 다른 두 세션의 목표 제출이다. 열 차례 성공과 교육 효과라는 과장된 해석을 제거하고 두 관찰과 사용자 요청을 유지한다.'),
}

def make_profile(i,s):
 prevsid=uid(i+'/previous-session');sid=uid(i+'/current-session')
 pf=finding('F1',s['previous'],[uid(i+'/previous-event')])
 fs=[finding('F'+str(j+1),obs,[uid(i+'/current-event/'+str(j))]) for j,obs in enumerate(s['current'])]
 fs[0]['interpretation']=s['claim']
 # These upstream snapshots are built solely from authored input facts/claims.
 def snapshot(summary,findings,assessments):
  return dict(summary=summary,findings=findings,sessionAssessments=assessments,uncertainties=['제공된 관찰 범위만 사용한다.'],
    practicePlan=plan([f['id'] for f in findings]),usedEvidenceCardIds=[])
 assessment=dict(sessionId=sid,judgment=s['outcome'],explanation=s['current'][0],evidenceEventIds=fs[0]['evidenceEventIds'])
 fx=dict(previousSourceSessionId=prevsid,previousProfile=snapshot('제공된 이전 관찰.',[pf],[]),
     currentAnalysis=snapshot(s['claim'],fs,[assessment]))
 for side in ['previousProfile','currentAnalysis']:
  fx[side]['uncertainties']=['실제 참여자의 기록이 아닌 합성된 이전/현재 관찰이다.']
  pl=fx[side]['practicePlan'];pl.update(itemCount=s['n'],textSupport='STANDARD')
  pl['goal']=f"{s['n']}종류의 제출을 관찰한다."
 lineage=[{'side':side,'event_id':f['evidenceEventIds'][0],'observation':f['observation']} for side,x in [('previous',fx['previousProfile']),('current',fx['currentAnalysis'])] for f in x['findings']]
 goal=f"{s['n']}종류의 목표를 "+{'STANDARD':'일반 문자 목록','SIMPLIFIED':'짧고 명확한 문자 목록','REDUCED':'설명을 줄이고 품명·수량을 남긴 목록'}[s['text']]+'으로 다시 관찰한다.'
 pl=plan(['F1','F2'],(s['d'],s['n'],s['q'],s['b'],s['text'],goal));pl['rationale']=s['correction']+' 품목 수만으로 능력 수준을 정하지 않는다.'
 outfs=[finding('F1',s['previous'],pf['evidenceEventIds'],'과거 관찰은 해당 세션의 범위로 보존한다.',goal),
        finding('F2',' '.join(s['current']),[e for f in fs for e in f['evidenceEventIds']],s['correction'],goal)]
 answer=dict(summary=s['correction'],findings=outfs,
     uncertainties=['이번 관찰만으로 인지 능력·무지원 수행·교육 효과·실생활 전이를 확정할 수 없다.'],practicePlan=pl,usedEvidenceCardIds=[])
 return fx,answer,lineage

def build():
 if (OUT/'verification.json').exists():raise RuntimeError('Refusing to overwrite verified native-v3; use a new version.')
 OUT.mkdir(exist_ok=True);(OUT/'inputs').mkdir(exist_ok=True)
 manifest=json.loads((OLD/'manifest.json').read_text());changes=[]
 sessions={s[0]:s for s in SPECS}
 for c in manifest['cases']:
  i=c['id'];fx=json.loads((OLD/'inputs'/f'{i}.json').read_text())
  if i in sessions:
   fx,answer,source=make_session(sessions[i]);c['input_fact_excerpt']=source;c['expected_expanded']=answer
   c['reference_remap']={};c['source_card_ids']=[]
   c['rewrite_note']='v3: 반복되던 두 종류 합성 과제를 세/네 종류의 관찰·유지 사례로 재작성. 진단에 근거한 행동 가정 없음.'
  elif i in PROFILE_SPECS:
   fx,answer,lineage=make_profile(i,PROFILE_SPECS[i]);c['expected_expanded']=answer;c['fact_lineage']=lineage
   c['reference_remap']={};c['source_card_ids']=[]
   c['rewrite_note']='v3: 새로운 합성 상위 분석의 관찰·보고와 AI 주장을 구분하고 현재 근거 범위에서 정정. 실제 수집 필드 구현을 주장하지 않음.'
  elif i=='T09':c['expected_expanded']['sessionAssessments'][0]['explanation']='260초에 사과 2개·생수 1개를 3200원으로 제출해 목표와 예산을 충족했다. 앱 배경 상태 180초를 과제 수행 시간으로 확정하지 않는다.'
  elif i=='T20':
   c['expected_expanded']['summary']='사과 2개·생수 1개를 3200원으로 제출해 목표와 예산을 충족했다.'
   c['expected_expanded']['findings'][0]['interpretation']='관찰된 제출은 목표와 예산에 맞는다. 지능 수준은 이 기록으로 판단할 수 없다.'
  elif i=='T40':c['expected_expanded']['uncertainties']=['네트워크 지연이나 사건이 서버에 도착한 순서는 제공된 행동 시각만으로 알 수 없다.']
  if i in sessions or i in PROFILE_SPECS or i in ('T09','T20','T40'):
   changes.append({'id':i,'change':c['rewrite_note'] if i not in ('T09','T20','T40') else '설명에 제출 근거를 명시하고 내부 처리 표현을 정리.'})
  dump(OUT/'inputs'/f'{i}.json',fx);c['input_sha256']=sha(OUT/'inputs'/f'{i}.json')
 manifest.update(version='native-v3',parent_manifest_sha256=sha(OLD/'manifest.json'),changes=changes,
    eval_role='FROZEN_V2_DEVELOPMENT_SET_ALREADY_INSPECTED_NOT_BLIND')
 dump(OUT/'manifest.json',manifest)
 shutil.copyfile(OLD/'eval.candidate.jsonl',OUT/'eval.candidate.jsonl')
 print(f'Built {len(changes)} training revisions; 60 train, unchanged 25 evaluation cases.')
if __name__=='__main__':build()
