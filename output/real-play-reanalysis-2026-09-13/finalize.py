import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'result.json').read_text());a=json.loads((p/'audit.json').read_text())['attempts'];a=json.loads(a) if isinstance(a,str) else a
reasons={1:'통과',2:'대안 설명은 배열이어야 하나 문자열을 반환',3:'재시도 후 통과',4:'대안 설명은 배열이어야 하나 문자열을 반환',5:'대안 설명과 근거 사건 목록을 모두 문자열로 반환'}
lines=['# 실제 플레이 재분석 — 전체 AI 응답 원문','','최종 결과: FAILED / INVALID_AI_ANALYSIS. 11개 구간 중 2개 완료. 아래는 최종 분석이 아니라 실제로 생성된 구간 응답 5개입니다. 내용은 교정하지 않았으며 구조 검사 통과 여부와 사실성은 별개입니다.','','## 호출 시간과 검사 결과','','| 호출 | 대상 | 시간 | 출력 토큰 | 검사 결과 |','|---|---|---:|---:|---|']
for v in a:
 n=v['number'];sec=v['latencyMs']/1000
 lines.append(f"| {n} | 구간 { {1:1,2:2,3:2,4:3,5:3}[n]} | {sec:.2f}초 | {v['outputTokens']} | {reasons[n]} |")
lines.extend(['','전체 분석 처리 1,102.449초(18분22초), 폴링으로 결과 확인까지 1,111.14초(18분31초). 모든 호출 finishReason은 stop이며 출력 한도 1,800토큰에서 잘린 응답은 없습니다.','','## 검사 거절의 의미','','위험한 내용 때문에 차단된 것이 아닙니다. JSON 자체는 파싱되지만 프로그램이 요구하는 배열 자료형과 일치하지 않아 AiObservationDigest 역직렬화 단계에서 거절됩니다.','', '요구 형식: `["관찰", "해석", ["다른 설명"], ["E134"]]`','', '5번 응답의 실제 형식: `["관찰", "해석", "다른 설명", "E134"]`','', '재시도 지시에는 INVALID_JSON_OR_CONTRACT라는 일반 문구만 전달되어 배열/문자열 오류가 정확하게 설명되지 않았습니다. 이번에는 검사를 우회하거나 응답을 자동 교정하지 않았습니다.',''])
for v in a:
 n=v['number'];d=json.loads(v['rawOutput']);lines.extend([f'## 호출 {n}: {reasons[n]}','','### 요약','',d['s'],''])
 for idx,row in enumerate(d['o'],1):
  def text(x):return ' / '.join(x) if isinstance(x,list) else x
  lines.extend([f'### 관찰 {idx}','',f'**관찰:** {row[0]}','',f'**해석:** {row[1]}','',f'**다른 설명:** {text(row[2])}','',f'**근거:** {text(row[3])}',''])
 lines.extend(['### 한계','']+['- '+u for u in d['u']]+['','<details><summary>검증 전 JSON 원문</summary>','','```json',v['rawOutput'],'```','','</details>',''])
(p/'all-ai-responses.md').write_text('\n'.join(lines))
q=p/'quality-notes.md';s=q.read_text();s+='''

## 최종 실행 결과

18분22초 처리 후 INVALID_AI_ANALYSIS로 실패했다. 11개 구간 중 2개만 통과했으며 최종 통합/연습 계획은 생성되지 않았다. 출력 한도 문제는 이번 실행에서 재현되지 않았지만 배열/문자열 형식 불일치가 3개 응답에서 발생했다.

## 구간 3 (거절된 응답)

- 실제 바나나 1개 선택을 포착했다.
- ITEM_SEARCH_STARTED를 검색 도구 사용으로 오인하는 문제는 계속 나타났다.
- 첫 응답에는 한국어 문장 중 '다음购买商品'이라는 중국어가 섞였다.
- 'produce'를 '생산품 선반'으로 직역한 표현이 나왔다. 원본은 과일/채소 구역이다.
- 선반 영역에서 약 7초 머물렀다는 표현은 원본 시각 대조가 필요하며, AI가 적은 시간을 그대로 확정값으로 사용하면 안 된다.

## 판단

한도를 늘려 이번에는 JSON 잘림을 피했지만, 현재 구조로는 실제 플레이 전체를 안정적으로 처리하지 못했다. 형식 오류는 명확한 배열 예시·필드별 재시도 오류 안내로, 내용 오류는 이벤트 발생 조건/뜻과 상품-구역 관계를 알려주는 것으로 각각 다뤄야 한다. 검증을 끄는 것은 내용 오류를 고치지 못한다. 이는 한 번의 실행 결과이며 일반적인 정확도 점수는 산출하지 않았다.
''';q.write_text(s)
print('Generated all-ai-responses.md and quality-notes.md')
