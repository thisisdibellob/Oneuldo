import json,subprocess
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'result.json').read_text());dataset=r['job']['datasetId'];start=r['startedAt']
sql="SELECT coalesce(json_agg(t ORDER BY created_at),'[]') FROM (SELECT id,created_at,response,output_max,input_prompt FROM ai_analysis_checkpoints WHERE dataset_id='%s' AND created_at >= '%s'::timestamptz) t"%(dataset,start)
raw=subprocess.check_output(['docker','exec','oneuldo-postgres','psql','-U','oneuldo','-d','oneuldo','-At','-c',sql]);items=json.loads(raw)
(p/'checkpoints.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
lines=['# 실제 플레이 재분석: AI 생성 원문','',f"상태: {r['job']['status']} / {r['job']['stage']} · 완료 구간 {r['job']['completed']}/{r['job']['total']}",'','대상: 2026-09-06 장보기 플레이 556개 사건. 아래 문장은 모델이 생성한 내용이며 사실 확인·수정한 문장이 아닙니다.','']
for i,item in enumerate(items,1):
 res=item['response'];res=json.loads(res) if isinstance(res,str) else res
 lines.extend([f'## 구간/통합 응답 {i}','',f"입력 {res.get('inputTokens')} / 출력 {res.get('outputTokens')}토큰 · {res.get('latencyMs',0)/1000:.1f}초 · 종료 {res.get('finishReason')}",''])
 text=res['text']
 try:
  d=json.loads(text)
  lines.extend(['### 요약','',d.get('s',d.get('summary','')),''])
  for n,o in enumerate(d.get('o',[]),1):
   lines.extend([f'### 관찰 {n}','',f'**관찰:** {o[0]}','',f'**해석:** {o[1]}','', '**다른 설명:** '+ ' / '.join(o[2]),'', '**근거 사건:** '+', '.join(o[3]),''])
  lines.extend(['### 한계','']+['- '+v for v in d.get('u',[])]+[''])
 except Exception:lines.extend(['```json',text,'```',''])
 lines.extend(['<details><summary>JSON 원문</summary>','','```json',text,'```','','</details>',''])
if r.get('analysis',{}).get('analysis'):
 lines.extend(['## 최종 분석 원문','','```json',json.dumps(r['analysis']['analysis'],ensure_ascii=False,indent=2),'```',''])
(p/'ai-output.md').write_text('\n'.join(lines))
print('Exported checkpoints:',len(items))
