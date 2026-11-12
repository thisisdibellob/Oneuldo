# Legacy v2 — 기존 네 인물 고정 검증 절차와 구현 기록

이하의 네 인물·대조군 대비 방향·인물 이름 판별·64칸 예시는 **기존 v2 모드 전용**이다. 위 공통 성향 v3의 기본값이나 성향별 정답표로 사용하지 않는다. 저장된 과거 run의 재검사와 명시적인 legacy 요청에 적용한다.

검증의 범위는 설계한 허구 인물이 대조군과 구별되게 행동하는지까지다. 실제 지적장애인의 행동 유사성이나 임상적 타당성을 검증하지 않는다. 대조군은 지민의 개인 설정을 공유하므로 서연·민수와의 비교에는 취향 차이가 섞인다. 표본은 Luna `whole-trace-v3` 전체 계획이고, 실제 앱 수행·학습·임상 관찰 결과가 아니다.

검증은 아래 도구를 직접 호출할 때만 실행된다. 기존 생성·제출·최종화 경로는 지표 측정이나 블라인드 채점을 호출하지 않는다. 서버가 모델·provider·앱·백엔드에 요청하거나 trace를 수정·재생성하지 않는다. MCP와 `node market-simulator/cli.cjs interactive`에서 같은 도구를 호출한다. 아래 객체는 MCP 입력이며 interactive에서는 `{"tool":"도구명","arguments":입력객체}`로 한 줄씩 보낸다.

### 1. run 준비

저부하는 목표 2개, 고부하는 목표 5개이며 적어도 한 목표의 수량은 2 이상이어야 한다. 저장된 시작 전 snapshot을 사용하고 파일 내용·snapshot ID를 고정한다. `seeds` 개수가 인물·조건별 표본 수다. 파일럿 8개는 4인물 × 2조건 × 8 = 64칸이며 본 실행은 조건별 20개 이상을 사용한다. 이번 구현·테스트는 이 파일럿을 실행하지 않았다.

`prepare_persona_validation` 입력:

```json
{
  "runId": "pilot-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {"low":"/absolute/low.json","high":"/absolute/high.json"},
  "seeds": ["s01","s02","s03","s04","s05","s06","s07","s08"],
  "personaIds": ["mild-intellectual-disability-adult","careful-checker","quick-decider","neutral-adult-control"]
}
```

응답 주요 필드:

```json
{
  "runDirectory": "/absolute/output/pilot-01",
  "manifestPath": "/absolute/output/pilot-01/manifest.json",
  "complete": 0,
  "required": 64,
  "slots": [{"condition":"low","seed":"s01","personaId":"neutral-adult-control","exists":false,"traceId":null}]
}
```

실제 응답의 각 `slot`에는 `tracePath`, 고정 인물·정책·bundle·candidate 버전, snapshot ID와 **그대로 사용할 `prepareWholeTrace` 객체**도 포함된다. seed 디렉터리는 안전한 인덱스·해시로 만들므로 경로를 직접 조립하지 않는다. 같은 입력으로 재호출하면 진행 상태만 갱신한다. 다른 설정은 새 runId로 만든다. 원본 snapshot·인물 정의·명세가 바뀌면 기존 run은 거절된다. v1 manifest는 새 형식과 섞지 않고 별도 runId로 다시 준비한다.

### 2. 전체 계획 생성 — 슬롯마다 작성 문맥 분리

반환된 64칸 중 비어 있는 칸마다 `prepare_whole_trace(slot.prepareWholeTrace)`를 호출한다. `attentionExperience`는 `{ "visit": "first-play" }`이고 learner/trial 파일을 쓰지 않는다. 각 슬롯의 outputPath를 유지한다.

**슬롯 하나마다 새 Luna low 작성 문맥**에서 해당 request/bundle 하나만 읽고 candidate 7 전체 계획을 작성한다. 저부하·고부하나 다른 인물의 bundle을 같은 작성 문맥에 함께 주지 않는다. 후보의 requestId와 bundle.inputHash를 출처로 기록한다. 제출은 요청을 준비한 같은 persistent MCP/interactive 프로세스의 `submit_whole_trace`에 한다. [전체 계획 절차](../generation/whole-trace.md)의 문법·관찰 범위·허용된 기술 수정 절차를 따른다. 충실도 결과를 보고 오류·이탈 횟수를 맞추거나 재생성을 자동 요청하지 않는다.

대조군은 별도 registry에서만 제공한다. 일반 `list_personas`, `generate_trace`, 배우 계획, learner·학습 trial 생성/읽기는 대조군을 거절한다. `prepare_whole_trace`가 출력 경로에 연결된 실제 manifest 셀, 인물·seed·snapshot 내용·미저장 상태·first-play만 있는 경험을 확인한 뒤에만 전체 계획 전용 인물 조회 scope를 연다. 일반 `getPersona`는 그 scope 안에서도 대조군을 거절한다. 대조군의 개인 지침·수치와 공통 엔진의 잔여 제약은 [audit](../../market-simulator/personas/audit.md)에 기록했다.

### 3. 조건부 측정

`measure_persona_validation` 입력과 응답 예:

```json
{"runDirectory":"/absolute/output/pilot-01"}
```

```json
{"measurementsPath":"/absolute/output/pilot-01/measurements.json","completed":64,"missing":0,"unexercised":12,"pairedUnexercised":12,"perTraceUnexercised":30,"fixtureOnly":false}
```

위 숫자는 응답 형식 예시이며 실행 결과가 아니다. 빈 칸은 건너뛰고 보고한다. trace ID·인물·정책·모델·bundle·candidate·snapshot·감사 자료 연결이 어긋나면 오류로 거절한다. 처음 기록한 trace·sidecar를 덮어쓴 경우 진행 상태 새로고침으로 받아들이지 않는다. 보고서는 새 표본 추가나 원본 변경 뒤의 오래된 측정값도 거절한다.

지표 조건이 실제로 발생하지 않으면 `unexercised`이며 값은 null이다. 관찰 증거가 없는 비교 기회나 불일치를 0으로 대체하지 않는다. 목록/장바구니를 읽는 행동 자체는 수정이 아니며 실제 불일치를 줄인 구매·반품이 있어야 수정으로 센다. 모델이 고른 행동은 knowledge audit·actor-decisions와 실제 replay step을 연결한다. 자동 시작·화면 닫기·시스템 종료 동작을 인물의 판단 시간으로 세지 않는다. persona-review는 출처/조건 보조 근거이며 기존 리뷰의 pass 여부를 충실도 점수로 복사하지 않는다.

같은 조건·seed의 인물과 대조군이 모두 해당 조건을 경험했을 때만 한 쌍으로 비교한다. Cliff’s delta는 두 분포의 효과 크기이고 부트스트랩은 seed 쌍을 함께 재표집한다. 95% 구간은 `src/random.ts`의 seed 난수로 재현 가능하다. 방향 일치, |delta| ≥ 0.33, 구간의 0 제외가 모두 성립하면 pass, 반대 방향이면 fail이다. 나머지는 inconclusive, 유효 쌍 8 미만은 insufficient다. 이 값과 플래그 허용률 10%는 명세의 설계값이며 임상 기준이 아니다. 결과에 맞춰 조정하지 않는다.

특성별로 지표 하나가 한 표를 갖는다. 양 조건 지표는 실제로 경험한 모든 적용 조건이 pass여야 그 지표가 pass다. 표본이 빠진 조건은 insufficient로 남고, 실제 조건 미발생만 제외한다. 특성의 경험된 지표 중 과반이 pass이면 expressed다. 모두 미발생이면 특성도 unexercised다. 인물 간 기대 순서는 부하별 공통 seed로 따로 비교하며 표본 수가 부족하면 통과를 주장하지 않는다.

과장 검사는 trace 단위 플래그와 조건별 표본 집합 위반을 나눈다. 목표 시도에서 드러난 수량·규격 불일치와 실제 거절을 오류로 측정하며, 명시적 관심 구매는 같은 상품이어도 목표 오류로 세지 않는다. 오류/관심 횟수 분산 0은 횟수 강제의 신호이며 인과적 증명이 아니다. 미관찰 오류·관심 상태를 pass로 바꾸지 않는다. 근거는 trace 경로·step ID·조건과 함께 저장하고 대조군도 같은 검사를 받는다.

### 4. 새 판별 세션 — A 먼저, B 나중

**trace를 생성하지 않은 새 Codex 세션**에서 판별한다. 판별자는 `publicProfiles`와 반환된 panel 파일만 읽고 `blind-key.json`, 원본 trace·manifest·측정값을 열지 않는다. 서버는 실제 세션 독립성·정답 키 미열람을 강제하거나 입증할 수 없다. 자기 신고 모델·세션 라벨만 저장하고 보고서에 ‘입증되지 않음’을 명시한다.

`prepare_blind_review` 입력:

```json
{"runDirectory":"/absolute/output/pilot-01","panel":"A"}
```

응답 주요 필드:

```json
{"panel":"A","bundlePath":"/absolute/output/pilot-01/blind-A.json","bundle":{"panels":{"A":[{"opaqueId":"random-uuid","version":"A","trace":{"steps":[{"type":"readList","reactionDelayMs":1200}]}}]}},"publicProfiles":[{"id":"careful-checker","description":"공개된 인물 설명"}],"fixtureOnly":false}
```

공개 설명은 익명 trace 묶음 바깥에 별도로 둔다. 익명 묶음 전체에서 인물 ID·이름·파일 경로가 발견되면 중단한다. 중첩 target도 허용 필드만 남긴다. A는 행동 종류·대상·순서·행동 전 대기시간, B는 여기에 reason만 더한다. 두 판의 opaque ID와 순서는 독립적이다. movement·gesture·seed·trace ID·step ID·generation·experience·인물 metadata는 제거한다. 블라인드 표본 집합은 최초 준비 뒤 고정된다.

`submit_blind_review` 입력:

```json
{"runDirectory":"/absolute/output/pilot-01","panel":"A","answers":{"random-uuid":{"personaId":"careful-checker","confidence":0.8}},"reviewerModel":"self-reported-model","reviewerSession":"self-reported-new-session"}
```

답안은 실제 해당 판의 모든 opaque ID를 포함해야 한다. 문자열 personaId도 허용하며 confidence는 선택적 0..1이다. 누락·추가 ID·잘못된 확신도는 거절한다. 응답 `score`에는 n, correct, accuracy, chanceAccuracy(0.25), alternative(`greater`), pValue, binaryCorrect, binaryAccuracy, confusionMatrix가 있다. p값은 우연 정확도 25%보다 높다는 단측 정확 이항검정이다. 혼동 행렬의 행은 실제 인물, 열은 예측 인물이다. 채점한 답안의 동일 재제출은 허용하지만 점수를 본 뒤 답을 바꿀 수 없다.

다음은 1건으로 구성된 판의 `submit_blind_review` 응답 구조 예시다. 실제 파일럿 실행 결과가 아니다.

```json
{
  "reviewPath": "/absolute/output/pilot-01/blind-review.json",
  "panel": "A",
  "score": {
    "n": 1,
    "correct": 1,
    "accuracy": 1,
    "chanceAccuracy": 0.25,
    "alternative": "greater",
    "pValue": 0.25,
    "binaryCorrect": 1,
    "binaryAccuracy": 1,
    "confusionMatrix": {
      "mild-intellectual-disability-adult": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0},
      "careful-checker": {"mild-intellectual-disability-adult": 0, "careful-checker": 1, "quick-decider": 0, "neutral-adult-control": 0},
      "quick-decider": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0},
      "neutral-adult-control": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0}
    }
  },
  "independenceVerified": false,
  "keyIsolationVerified": false
}
```

A를 채점한 후 `prepare_blind_review({... ,"panel":"B"})` → 같은 자기 신고 라벨로 `submit_blind_review({... ,"panel":"B"})`를 호출한다. B는 A를 채점하기 전에는 반환하지 않는다. A/B 결과는 따로 보고한다.

### 5. 보고서

`persona_validation_report` 입력과 응답:

```json
{"runDirectory":"/absolute/output/pilot-01"}
```

```json
{"reportPath":"/absolute/output/pilot-01/report.json","markdownPath":"/absolute/output/pilot-01/report.ko.md","completed":64,"required":64,"fixtureOnly":false}
```

조건별 지표·효과·95% 구간·특성 판정·과장 근거·A/B 판별·한계를 합친다. 답안이 아직 없으면 그 사실을 기록한다. 블라인드 표본과 측정 표본이 달라지면 기존 판별 결과를 합치지 않는다.

교차 확인용 Node 최근접 중심 분류기는 부하별 leave-one-out이며 각 class에 최소 2개 표본이 필요하다. 훈련 fold만으로 척도를 맞추고 네 class 공통 관측 특성만 사용한다. 미발생은 0으로 채우지 않으며 동점은 보류한다. 판별 가능 비율 coverage, 보류를 분모에 포함한 정확도를 함께 보고한다. LOO 예측은 학습 자료를 공유하므로 이 p값은 독립 표본의 유의성 증거가 아닌 기술적 교차 확인이다.

`allowFixture:true`는 측정·블라인드 준비의 테스트 전용 옵션이다. stochastic와 whole-trace를 섞지 않는다. fixture 기반 보고서는 `fixtureOnly:true`와 ‘파이프라인 확인용이며 검증 결과가 아님’을 표시한다. 테스트의 복제 fixture를 64개 독립 생성 표본으로 해석하지 않는다.

### 최종 지표

아래 ↑/↓는 모두 `neutral-adult-control` 대비 기대 방향이다. 실제 JSON은 지민 특성 4개, 서연·민수 특성 각 5개이므로 전부 연결했다. 문장 원문·상세 조건·통과 기준은 [명세](../../market-simulator/validation/persona-validation-spec.json)에 고정한다.

| 인물 / 특성 | 분모에 포함되는 상황 | 측정값 | 방향 | 부하 |
| --- | --- | --- | --- | --- |
| 지민 1: 한 항목·목록 재확인 | 선택 뒤 다음 다른 목표가 있음 | 다음 목표 전 목록 읽기 비율 | ↑ | 고 |
| 지민 2: 낯선 배치·도움 | first-play 첫 매대 진입 | 진입 전 탐색·도움 행동 수 | ↑ | 둘 다 |
| 지민 3: 카레 관심 전환 | 카레 비목표, 카레 단서 노출 구간 | 이후 비목표 관심 진입 비율·구간 길이 | ↑ | 둘 다 |
| 지민 4: 확인 후 목표 복귀 | 미완료 목표가 남은 관심 구간 | 목록·장바구니 확인 뒤 목표 복귀 비율 | ↑ | 둘 다 |
| 서연 1: 배운 확인 순서 | 선택 뒤 다음 다른 목표가 있음 | 다음 목표 전 목록 읽기 비율 | ↑ | 둘 다 |
| 서연 2: 새 조건 처리 | 낯선 매대 첫 열기 | 행동 전 평균 대기 ms | ↑ | 둘 다 |
| 서연 3: 비교·절약 | 관련 후보 2개 이상 또는 추가 페이지 기회 | 관련 후보를 탐색해 비교한 비율 | ↑ | 둘 다 |
| 서연 3: 결제 전 확인 | 인물이 계산 단계에 도달 | 마지막 선택 뒤 장바구니 확인 비율 | ↑ | 둘 다 |
| 서연 4: 피드백으로 수정 | 실제 피드백 또는 확인 가능한 불일치 | 실제 불일치를 줄인 선택·반품 비율 | ↑ | 둘 다 |
| 서연 5: 자기 선택 | 상품 선택 | 화면 닫기를 뺀 직전 행동이 도움이 아닌 비율 | ↑ | 둘 다 |
| 민수 1: 익숙한 빠른 선택 | 익숙한 상품 선택 | 행동 전 평균 대기 ms | ↓ | 둘 다 |
| 민수 2: 복합 조건 부담 | 시도한 수량·규격 목표 | 최종 목표 불일치 비율 | ↑ | 고 |
| 민수 3: 짧은 비교 | 비교 기회가 있음 | 선택 전 비교 탐색 비율 | ↓ | 둘 다 |
| 민수 4: 짧은 관심 | 관심 구간 | 구간당 평균 행동 수 | ↓ | 둘 다 |
| 민수 5: 불일치 수정 | 실제 피드백 또는 확인 가능한 불일치 | 실제 불일치를 줄인 선택·반품 비율 | ↑ | 둘 다 |

인물 간 기대 순서는 결제 전 장바구니 확인·비교 탐색에서 각각 서연 > 지민 > 민수이며 low/high를 따로 보고한다.

### 이번 구현의 기반 통합

현재 v2 작업 브랜치에는 요청의 `whole-trace-v3` 전체 계획과 학습 실험 기반이 없었다. 검증 도구가 기존 전체 계획·저장 계약을 사용할 수 있도록 저장소의 `54c7a22`에서 필요한 전체 계획·학습 기반을 가져왔다. 통합 과정에서 원래 세 인물의 JSON·prompt·버전(지민 5, 서연 3, 민수 3), 페르소나 스키마 `personas/persona.schema.json`·출처와 인지 설정 수치는 유지했다. 가져온 기반의 문서에 있던 인물 6/4/4 표기를 활성 프로필 5/3/3에 맞췄다.

다만 **trace 스키마 불변 요구에서는 벗어났다.** 현재 브랜치에 전체 계획 기반이 없어 `54c7a22`의 계획 metadata·trace 스키마 확장과 시스템 완료 지원을 필요한 기반으로 가져왔다. 변경 대상에는 `frontend/src/game/marketReplayTrace.ts`와 `marketReplayTrace.schema.json`이 포함된다. 이는 새 검증 지표를 trace에 삽입하기 위한 변경이 아니라, 검증 대상인 기존 전체 계획 형식과 그 출처를 이 브랜치에서 읽고 저장하기 위한 통합이다. 따라서 유지한 페르소나 스키마와 변경된 trace 스키마를 구분한다. 정책 옵션·learner 신원 없이 호출한 기존 `generate_trace`의 v4 프롬프트·정책은 유지한다. 가져온 v9 동작은 `actorPolicyVersion:"episodic-choice-v9"` 또는 v9 learner 신원을 명시한 경우에만 선택한다. v10 직접 증분 계획과 `whole-trace-v3`도 각각 별도 도구로 시작하며, 100회 이후 시스템 완료는 이 세 신규 경로에만 적용한다.

다음은 legacy v2 구현 당시의 작업 기록이다. 당시 작업은 검증기 구현과 테스트까지였고 파일럿 64건은 생성하지 않았으며, 변경은 커밋·푸시 없이 작업 트리에 남겼다.

### 추가·수정한 핵심 파일

경로는 저장소 루트 기준이다. 기존 기반을 가져온 파일과 충실도 검증을 구현한 파일을 함께 기록한다.

| 구분 | 파일 | 역할 |
| --- | --- | --- |
| 지표 추출 | [`market-simulator/src/personaValidationMetrics.cjs`](../../market-simulator/src/personaValidationMetrics.cjs) | 관찰·배우 결정·trace 연결, 조건별 분모와 값, 공유 행동 집계 |
| 통계 | [`market-simulator/src/personaValidationStatistics.cjs`](../../market-simulator/src/personaValidationStatistics.cjs) | Cliff's delta, 재현 가능한 부트스트랩, 판정, 이항 채점·혼동 행렬, 최근접 중심 교차 확인 |
| 과장 검사 | [`market-simulator/src/personaValidationFlags.cjs`](../../market-simulator/src/personaValidationFlags.cjs) | trace 플래그, 조건별 집합 위반과 경로·step 근거 |
| 블라인드 묶음 | [`market-simulator/src/personaValidationBlind.cjs`](../../market-simulator/src/personaValidationBlind.cjs) | A/B 익명화, 잔여 식별자 검사, 공개 설명 분리와 순서 섞기 |
| run 저장·보고 | [`market-simulator/src/personaValidationRun.cjs`](../../market-simulator/src/personaValidationRun.cjs) | 매니페스트·출처·버전 검사, 측정·판별 저장, JSON·한국어 보고서 |
| 명세 | [`market-simulator/validation/persona-validation-spec.json`](../../market-simulator/validation/persona-validation-spec.json) | 15개 지표와 특성 연결, 조건·방향·효과 기준·과장 기준·인물 간 순서 |
| 대조군 | [`market-simulator/personas/neutral-adult-control.json`](../../market-simulator/personas/neutral-adult-control.json), [prompt 사본](../../market-simulator/personas/neutral-adult-control.md), [`src/personas.ts`](../../market-simulator/src/personas.ts), [`personas/audit.md`](../../market-simulator/personas/audit.md) | 검증 전용 인물, 일반 목록·학습 실험 격리, 설계값과 한계 |
| MCP·CLI | [`market-simulator/server.cjs`](../../market-simulator/server.cjs), [`cli.cjs`](../../market-simulator/cli.cjs) | 기존 서버의 검증 도구 5개와 동일 interactive 호출 경로 |
| 기존 집계 재사용 | [`market-simulator/scripts/verify-personalities.cjs`](../../market-simulator/scripts/verify-personalities.cjs) | 중복 집계를 제거하고 지표 모듈의 공유 집계 사용 |
| 테스트 | `market-simulator/test/persona-validation-*.test.cjs` | 지표·통계·과장·익명화·출처·대조군 격리·기존 경로 호환·fixture 통합 검사 |
| 전체 계획 필수 기반 | `market-simulator/src/wholeTrace*.ts`, [`generation-journal.cjs`](../../market-simulator/generation-journal.cjs), [`learning-trial.cjs`](../../market-simulator/learning-trial.cjs), [`learner-store.cjs`](../../market-simulator/learner-store.cjs), [`frontend/src/game/marketReplayTrace.ts`](../../frontend/src/game/marketReplayTrace.ts), [trace 스키마](../../frontend/src/game/marketReplayTrace.schema.json) 및 관련 관찰·실행 모듈 | `54c7a22`의 전체 계획 준비·제출·관찰 감사·저장·학습 연결·시스템 완료 계약 통합 |
| 실행 문서 | [`market-persona-skill/SKILL.md`](../SKILL.md), [`market-simulator/README.md`](../../market-simulator/README.md), 이 절차 문서 | 도구 호출 예시, 인물별 지표, 세션 분리, 한계와 통합 범위 |
