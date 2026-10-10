# 개인별 경험과 맞춤 퀘스트 비교 구현

## 구현한 범위

지민 v6, 서연·민수 v4는 기존 성격·선택한 특성·초기 습관을 유지한다. `character.learningProfile`은 처음부터 갖고 있던 습관과 이번 실험에서 관찰할 연습 영역을 구분한다. 매회 JSON 프로필을 수정하거나 오류율·능력 점수를 자동 조정하지 않는다. 두 원자료 전문과 금지 항목을 보존했다.

`learner-store.cjs`는 실행 완료 보고와 격리 DB receipt를 검증한 trace/snapshot/replay/receipt를 보관한다. learner/member/persona/version/experiment/arm/model/actor policy가 고정되며, 각 경험을 원본 실행 회차와 step에 연결한다. 전체 증거를 보존하고 현재 표시된 단서와 관련성·최근성을 기준으로 최대 12개 경험을 모델에 전달한다. 실패 경험도 보존하며 성공 여부로 검색 순위를 조정하지 않는다. C군은 증거를 보관하지만 이전 회차 기억을 모델에 전달하지 않는다.

`episodic-choice-v5`는 실제 제공된 경험의 fingerprint와 실험 입력 hash를 trace에 남긴다. 다음 입력의 개인·모델·시드·기억·생성 예산을 바꾸면 생성/기록 단계에서 거부한다. 같은 계정에서 다른 페르소나나 실험의 기억을 섞거나, 다른 계정 탭으로 결합된 trace를 실행하지 못하게 했다. 저장 도중 중단은 잠금 복구와 멱등 기록으로 재개한다.

도움말과 직원 응답은 앱과 공용 문구를 사용한다. 이동 선택지에 현재 보이는 방향과 표지 관계를 설명하되 정답 경로를 선택하거나 재방문을 금지하지 않는다. 실제 반납 버튼이 없는 독립 장바구니에는 반납 조작을 제시하지 않는다.

`learning-trial.cjs`와 MCP 도구가 기준 → 연습 → 공통 평가 순서를 관리한다. A는 사전 고정 일반 과제+기억, B는 맞춤 과제+기억, C는 맞춤 과제+기억 미전달이다. B/C의 연습에는 직전 세션의 READY 분석과 연결된 AI 퀘스트가 필요하며, 실제 snapshot과 퀘스트 본문을 대조한다. 과제의 안내·규격·수량과 내부 실행 목표가 다른 경우도 거부한다.

## 실제 사용

[스킬의 실험 절차](../../market-persona-skill/references/learning-trials.md)를 따른다. `create_learner`, `create_learning_trial`, `generate_learning_round`, `record_learning_round`, `record_learning_failure`, `compare_learning_trial`로 개인·회차·기억·측정값을 연결한다. 기존 `play_trace`가 앱 재생을 수행한다.

앱 로그인과 다음 미션 로딩, 인증된 분석/퀘스트 응답 수집, DB receipt 수집은 기존 앱·서버 도구로 이어간다. 준비 도구만으로 전체 앱 실험이 실행되지는 않는다. 도구는 서버 행동 로그를 만들거나 직접 POST하지 않으며 기존 앱 tracker/queue를 유지한다.

## 검증과 해석

자동 테스트는 관찰 정보 전달, 기억 검색·출처·격리, 실행/DB 증거 계약, 분석/퀘스트 연결, 실패 보존, 재시작, 실제 MCP 호출 계약을 검사한다. 테스트의 actor/DB receipt 대역은 실제 모델·앱·DB 실험으로 집계하지 않는다.

- `node --test --test-concurrency=2 market-simulator/test/*.test.cjs`: 143/143 통과. 루프백 브릿지 격리 테스트를 포함한다.
- 마지막에 추가한 직접 모듈 호출의 생성 예산/기억 결합 검증: 통과. `server-learning.test.cjs` 4/4이며 위 전체 실행과 3건이 겹친다(중복 제외 시 시뮬레이터 144건).
- 프런트엔드 `MarketSimulationScreen`, `marketReplayPerception`, `marketReplayMotor`, `marketReplayConnection`: 4개 suite, 58/58 통과.
- 시뮬레이터와 프런트엔드 TypeScript 검사 통과.
- 스킬 frontmatter·로컬 참조 링크 검사 및 독립 도구 계약 검토 통과. 제공된 Python quick_validate는 PyYAML 부재로 실행되지 않아 설치된 YAML 파서로 동일한 frontmatter/이름/설명/미완성 표식 항목을 검사했다.
- `git diff --check` 통과.

계약 검증에서는 명시적인 actor 및 DB receipt 대역을 사용했다. 모델 수행 향상이나 실제 앱/DB 완료 표본으로 세지 않는다.

## 이번 작업에서 확인하지 않은 것

이번 환경에는 MARKET_LLM_* 및 MARKET_REPLAY_CONFIG 설정이 없었고 개발 앱·백엔드가 실행 중이지 않았다. 실제 LLM 호출·앱 플레이·DB 전송·맞춤 퀘스트 반복은 실행하지 않았다. 이전 시험의 탐색 반복 문제가 줄었는지, 기준 과제를 완주하는지, 개인 경험이나 맞춤 과제로 수행이 개선되는지는 미판정이다.

비교 결과는 공통 조건의 전후 측정값과 미완료를 함께 제시한다. 도움 사용은 자동 감점하지 않으며 compact 재생 시간·모델 생성 시간은 능력 지표에서 제외한다. B/C의 적응형 과제는 달라질 수 있으므로 그 차이는 기억이 포함된 전체 과정의 차이다. 동일 과제에서 기억만의 효과나 다른 상품으로의 전이는 별도 조건에서 확인한다. 이 구현과 합성 실험 결과만으로 실제 지적장애인의 학습 효과를 입증하지 않는다.
