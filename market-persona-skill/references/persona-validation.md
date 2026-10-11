# 페르소나 충실도 검증 절차

이 검증은 허구의 네 인물 설정이 생성된 `whole-trace-v3` 행동에 조건부로 표현되는지 확인한다. 실제 지적장애인의 행동 유사성이나 임상적 타당성을 검증하지 않는다. 지민·서연·민수와 `neutral-adult-control`을 같은 snapshot·seed로 묶는다. 대조군은 지민과 취향을 공유하므로 서연·민수와의 차이에는 취향 차이가 섞일 수 있다.

## 준비

저부하 snapshot에는 목표 2개, 고부하에는 목표 5개와 수량 조건을 둔다. 두 파일의 ID와 내용은 run 동안 고정한다. 파일럿은 seed 8개, 본 실행은 조건당 20개 이상으로 한다. 세션 경험은 `{ "visit": "first-play" }`로 고정하고 learner/trial 파일은 전달하지 않는다.

```json
{"tool":"prepare_persona_validation","arguments":{"runId":"pilot-01","outputDirectory":"/absolute/output","snapshotFilePaths":{"low":"/absolute/low.json","high":"/absolute/high.json"},"seeds":["s01","s02","s03","s04","s05","s06","s07","s08"],"personaIds":["mild-intellectual-disability-adult","careful-checker","quick-decider","neutral-adult-control"]}}
```

반환된 64개 `slots`의 `prepareWholeTrace` 입력을 하나씩 `prepare_whole_trace`에 전달한다. **슬롯 하나(한 인물·한 조건·한 seed·한 request/bundle)마다 새 Luna low actor 문맥**에서 candidate 7 전체 계획을 작성한다. 저부하와 고부하 또는 다른 인물의 bundle을 같은 작성 문맥에 함께 주지 않는다. 해당 `requestId`·`bundle.inputHash`를 후보 출처로 기록하고 `bundle.authoringGuide`의 문법·상태 전이 예제를 확인한다. 제출은 요청을 준비한 같은 persistent MCP/`cli.cjs interactive` 프로세스의 `submit_whole_trace`에 한다. 호스트 프로세스는 여러 요청을 관리할 수 있지만 서버가 actor 문맥 분리를 강제하거나 입증하지는 않는다. 각 슬롯의 `outputPath`를 바꾸지 않는다. 실패한 슬롯은 원래 절차의 허용된 suffix repair만 사용하며 검증기가 재생성을 지시하지 않는다. `prepare_persona_validation`을 다시 호출하면 존재 상태를 새로 읽는다.

## 측정과 판별

`measure_persona_validation({"runDirectory":"/absolute/output/pilot-01"})`은 저장된 trace만 읽어 `measurements.json`을 쓴다. 비어 있는 칸은 누락으로, 조건이 발생하지 않은 지표는 `unexercised`로 기록한다. 혼합 snapshot·인물·정책·candidate 버전과 stochastic trace는 거절한다. 효과 크기 임계값과 플래그 허용률은 `market-simulator/validation/persona-validation-spec.json`의 설계값이다.

`prepare_blind_review({"runDirectory":"...","panel":"A"})`은 A(행동·대상·순서·대기시간)를 먼저 반환한다. A 답안을 채점한 뒤 `panel:"B"`로 다시 호출하면 B(A와 reason)를 반환한다. knowledge audit에서 모델이 고른 행동만 연결하고 자동 시작·종료·시스템 계산 구간의 고정 대기시간을 제외한다. `blind-key.json`은 run 디렉터리에 별도로 저장된다. **trace를 생성하지 않은 새 Codex 세션**에서 두 panel과 공개 설명만 읽고, 정답 키 파일은 열지 않는다. 서버는 세션 분리와 키 미열람을 강제하거나 입증하지 못한다. A를 먼저 제출·채점하고 B를 뒤에 제출한다.

```json
{"tool":"submit_blind_review","arguments":{"runDirectory":"/absolute/output/pilot-01","panel":"A","answers":{"opaque-id":"careful-checker"},"reviewerModel":"self-reported-model","reviewerSession":"self-reported-session"}}
```

`answers`의 값은 persona ID 문자열 또는 `{ "personaId": "...", "confidence": 0.8 }`이다. 모든 opaque ID의 답이 필요하다. 같은 reviewer 라벨로 B도 제출한 뒤 `persona_validation_report({"runDirectory":"..."})`를 호출한다. 결과는 `report.json`과 `report.ko.md`에 남는다. reviewer 라벨과 세션 독립성은 자기 신고이고 리포트에 입증되지 않음으로 표시된다.

`allowFixture:true`는 테스트 전용이다. stochastic trace를 사용한 결과는 `fixtureOnly:true`로 표시하며 페르소나 충실도 근거로 인용하지 않는다.

실제 whole-trace의 관심 활동은 knowledge audit의 actorState/activity와 basis/intent에서 추출한다. 모터 miss는 이 생성 경로에서 관측할 수 없으므로 오류 횟수의 집합 검사는 미확인으로 남긴다. 명시적 실패 피드백이 없으면 수정률은 unexercised이며, 회복 능력의 실패로 해석하지 않는다. 조건별·인물별 1건의 시연에서는 효과 크기와 최근접 중심 교차 검증을 통과 판정하지 않는다.
