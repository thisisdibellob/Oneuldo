# 개인 경험을 이어가는 맞춤 퀘스트 비교

이 절차는 합성 페르소나의 수행을 비교한다. 실제 참여자의 학습 효과 검증이나 모델 파인튜닝은 아니다. 별도 DB와 A/B/C 각각의 테스트 계정, 개발 웹앱, 실제 LLM 연결을 준비한다. 앱 이동·로그인에는 기존 브라우저 도구를 사용하고, 앱 플레이는 완성된 trace를 `play_trace`로 전달한다.

## 먼저 고정할 조건

한 실험에서는 한 페르소나와 같은 모델/정책을 사용한다. 세 페르소나를 시험하려면 독립 실험 세 개를 만든다. 인물 JSON의 성격·초기 습관은 회차마다 변경하지 않는다.

| 군 | 연습 과제 | 이전 회차 경험 |
| --- | --- | --- |
| A | 미리 지정한 일반 과제 | 유지 |
| B | 직전 분석의 맞춤 과제 | 유지 |
| C | 직전 분석의 맞춤 과제 | AI에 미전달, 증거는 보관 |

C도 같은 플레이 안에서 읽은 목록·이동·작업 의도는 유지한다. 새 회차가 시작할 때만 이전 실행 경험을 주지 않는다. B/C는 결과에 따라 다음 맞춤 과제가 달라질 수 있으므로 B−C는 기억을 포함한 적응 과정의 차이다. 동일 과제에서 기억만의 효과를 분리하려면 별도로 고정된 과제 비교를 설계한다.

기준 과제와 마지막 평가 과제는 같은 조건을 사용한다. 일반 연습 과제, 연습 횟수, 호출/행동 상한, 재생 일정도 시작 전에 고정한다. 결과를 본 뒤 쉬운 과제로 교체하거나 상한을 올려 같은 표본으로 계속하지 않는다. 새 조건은 새 실험으로 기록한다.

## 개인과 실험 생성

`list_personas`에서 현재 버전을 확인한다. A/B/C마다 `create_learner`를 호출한다:

```json
{
  "directory": "/absolute/isolated-run",
  "learnerId": "jimin-A",
  "memberId": "dedicated-account-A-uuid",
  "personaId": "mild-intellectual-disability-adult",
  "experimentId": "jimin-trial-01",
  "arm": "A",
  "model": "configured-model-name"
}
```

B/C에는 다른 learnerId·memberId·arm을 넣는다. 모델 값은 실제 연결 모델과 같아야 한다. 현재 페르소나 버전과 AI 정책 버전은 MCP가 채운다. 반환된 learnerFile을 보관한다. 기존 파일은 덮어쓰지 않는다.

실제 앱에서 수집한 초기 snapshot을 읽어 다음 형태의 JSON 설정 파일을 만든다. `baselineSnapshot` 등에는 파일 경로가 아니라 snapshot 객체를 넣는다:

```js
const config = {
  directory: '/absolute/isolated-run',
  trialId: 'jimin-trial-01',
  personaId: 'mild-intellectual-disability-adult',
  personaVersion: '6',
  model: 'configured-model-name',
  policyVersion: 'episodic-choice-v5',
  trainingRounds: 3,
  generationLimits: { maxActions: 1000, maxCalls: 300, timingProfile: 'compact' },
  arms: {
    A: { learnerFile: '/absolute/isolated-run/jimin-A.learner.json' },
    B: { learnerFile: '/absolute/isolated-run/jimin-B.learner.json' },
    C: { learnerFile: '/absolute/isolated-run/jimin-C.learner.json' },
  },
  baselineSnapshot: snapshot,
  probeSnapshot: snapshot,
  fixedTrainingSnapshots: [snapshot, snapshot, snapshot],
};
```

`create_learning_trial({optionsFilePath})`에 저장한 설정 경로를 넘긴다. baseline → training 3회 → probe가 각 군의 순서다. 위 상한은 기술 실행 예산의 예시이며 사람의 능력 한도가 아니다. 시험 환경에 맞게 사전 설정한다. 다른 환경에서 배운 방법을 적용하는 전이 과제는 공통 과제의 전후 차이와 별도로 보고한다.

AI 정책 `episodic-choice-v9`는 별도로 모델 행동을 최대 100회 관찰한다. 반복은 기록만 하며, 100번째까지 모델이 스스로 제출·포기하지 않은 경우 당시 장바구니 그대로 계산·분석 접수하는 시스템 구간을 붙인다. 빈 장바구니도 허용하고 상품 추가·제거·정답 보정은 하지 않는다. 계산대까지 실제 이동 입력을 계획하고 필요하면 직원 호출을 거쳐 `submitForReview → awaitReviewAccepted → leave`로 끝낸다. `maxActions`/`maxCalls`/시간 예산을 늘려도 이 100회 상한은 늘어나지 않는다. 반대로 기술 예산이 작으면 100회 전에 생성 오류가 날 수 있다.

`generation.systemCompletion`은 `reason:'action-limit'`, `afterDecisions:100`, `actionLimit:100`, `firstStepId`, `checkoutId`, `cartAtStart`를 기록한다. 실제 실행·DB 증거와 제출 장바구니가 일치하면 `firstStepId` 이전 단계만 개인의 실행 경험으로 보관한다(`learningEligible:true`, `learningScope:'actor-prefix'`). 계산 이동·직원 호출·제출 등 시스템 구간은 경험에 들어가지 않는다. 앱 보고서에 시스템 시작 경계가 있으면 메타데이터·당시 장바구니도 대조한다.

검증된 시스템 계산 회차는 `assisted-submission`으로 저장하고 다음 분석·퀘스트 연결을 진행할 수 있다(`analysisEligible:true`). 구매 누락·초과·목록 밖 상품 등의 실제 제출 내용은 측정에 남기되 `performanceEligible:false`, `metrics:null`로 독립 완수의 기준/평가 비교에서 제외한다. `analysisEligible`은 분석 완료 상태가 아니며, 다음 B/C 과제는 여전히 직전 세션의 `READY`와 연결된 AI 퀘스트가 필요하다. 기존 v6/v7/v8의 `controlledStop`은 계속 미완료 시도로 남기며 학습하거나 회차를 전진시키지 않는다. 메타데이터를 삭제해 검증을 우회하지 않는다. 생성·검증만 요청받은 작업에는 아래 앱 재생·DB 수집·분석 절차를 수행하지 않는다.

## 매 회차의 실제 실행

1. 올바른 테스트 계정의 앱에서 해당 과제를 시작 전 화면으로 로드한다. 고정 과제는 개발용 `marketPilotScenario`와 실제 layout 설정으로 준비할 수 있으며 snapshot 전체가 사전 등록 조건과 같아야 한다. 화면을 로드하지 않고 JSON만 편집해 조건을 맞추지 않는다.
2. B/C의 연습 회차는 직전 sessionId의 분석 작업이 `READY`가 될 때까지 기다린다. 실제 job 응답과 AI 퀘스트 생성 응답 전체를 각각 파일로 보관한다. `source:'AI'`, analysisId·profileId·generationId와 화면의 퀘스트가 연결돼야 한다. A 및 공통 과제에는 맞춤 과제 파일을 넣지 않는다.
3. `generate_learning_round({trialFile,arm,tabId,outputPath,llm,...})`를 호출한다. B/C 연습에는 `jobFilePath`, `generationFilePath`도 넣는다. `llm`에는 baseUrl/protocol/apiKeyEnv/timeoutMs 등 연결 설정을 넣고 키 값은 넣지 않는다. 모델·호출 상한은 실험 설정에서 가져온다. 생성 없이 회차와 입력을 확정하려면 `prepare_learning_round`를 쓴다. 이 도구는 실험 파일에 준비 상태를 저장하지만 앱 입력은 보내지 않는다. tabId/snapshot/snapshotFilePath 중 정확히 하나를 제공한다.
4. 반환된 파일을 `validate_trace`로 확인한 뒤 `play_trace`로 해당 계정 탭에 보낸다. `replay_status`로 종료 상태를 확인한다. 앱 자체의 tracker/queue가 행동 로그를 전송한다. 생성기에서 로그를 대신 POST하지 않는다.
5. 실제 manifest와 DB에서 replay·receipt를 수집한다. 기존 로컬 수집 스크립트는 다음과 같다. 이 파일 수집은 읽기 전용이며 PostgreSQL 기본 로컬 포트와 `oneuldo_pilot_*` DB만 사용한다. 이 수집 스크립트는 출력 디렉터리의 `replay-manifest.jsonl`을 읽는다. 따라서 재생 전에 `MARKET_REPLAY_CONFIG.manifestPath`를 `/absolute/isolated-run/replay-manifest.jsonl`로 명시한다. trace의 outputPath만 바꿔서는 manifest가 이동하지 않는다.

   ```sh
   node market-simulator/scripts/record-pilot-round.cjs \
     /absolute/isolated-run round-A-0.json REPLAY_UUID oneuldo_pilot_NAME
   ```

   이 스크립트는 `round-A-0.replay.json`, `.receipt.json`, `.measurement.json`, `.job.json` 등을 새 파일로 저장한다. 실험에서는 archive 갱신을 다음 도구가 수행하므로 `--learner-file`은 여기서 생략한다. `.job.json`은 수집 시점의 상태다. 아직 READY가 아니면 분석 API에서 최신 응답을 새 파일로 수집한다. 상태 문구나 ID를 수동으로 고치지 않는다. 분석·퀘스트 응답은 평가/연결 확인용이며 플레이 AI의 기억으로 전달하지 않는다.
6. `record_learning_round({trialFile,arm,roundId,traceFilePath,replayFilePath,receiptFilePath})`를 호출한다. snapshot은 기본적으로 `traceFilePath + '.snapshot.json'`에서 읽는다. 도구는 실제 실행 순서·이동 가드·DB 연속성·개인·입력 기억·회차를 검사한 뒤 경험과 측정값을 저장한다. 같은 증거를 다시 제출하는 것은 중복 회차로 세지 않는다.
7. 다음 과제를 정상 앱 경로로 로드하고 반복한다. `generate_learning_round`가 이전 경험을 자동으로 불러오므로 memory를 수작업으로 편집하거나 이전 trace의 계획 기억을 복사하지 않는다.

준비된 회차의 모델 생성·검증·파일 저장 오류는 generate 도구가 기술 실패로 기록한다. 준비 전의 snapshot/계정/분석/설정 검사 오류는 자동 실패 기록에 포함되지 않는다. 분석 대기 실패는 다음 B/C 연습의 roundId(예: `jimin-trial-01:B:training:1`)와 stage `analysis`로 기록할 수 있다. 앱 실행·DB 저장·분석 단계에서 실패하면 `record_learning_failure`로 stage(`replay`/`persistence`/`analysis`)와 짧은 오류 코드를 기록한다. 비밀번호·토큰·원본 서버 응답을 code에 넣지 않는다. 기술 실패는 회차의 구매 오류 점수로 바꾸지 않는다. 사람이 고른 `giveUp`에 해당하는 AI 선택으로 정상 종료했다면 미제출 상태로 기록한다. 중도 끊긴 replay를 완료 경험으로 올리지 않는다.

## 기억의 의미와 검증

개인 archive에는 실행 원본을 보존하고 모델 입력은 현재 표시된 정보와 관련성·최근성으로 최대 12개 경험을 선택한다. 목록, 살펴본 상품, 담기/빼기, 장바구니, 실제 도움 문구·직원 응답을 활용할 수 있다. 각 항목은 원본 session/replay/step으로 추적한다. 표시 내용은 바인딩된 앱 코드/snapshot으로 재구성하므로 실제 시선이나 이해의 증거가 아니다.

`compare_learning_trial({trialFile})`은 각 회차의 품목·수량 정확도, 누락·초과·목록 밖 상품, 예산, 도움·목록·장바구니 확인을 보여준다. 비교 가능한 기준/평가 쌍만 차이를 계산하고 미제출·기술 실패·조건 불일치를 따로 보여준다. 도움을 더 사용하거나 더 천천히 했다는 사실만으로 악화라고 하지 않는다. compact 시간과 모델 생성 시간은 능력 지표에서 제외한다.

한 실험의 차이는 사례 비교다. 독립 초기 상태에서 반복하고, 개선이 없는 회차도 포함한다. `reason`, 기억 검색 여부, 안내 표시만으로 이해·습득을 판정하지 않는다. 실제 제출과 행동 증거로 판단한다. 자동 테스트 대역을 실제 앱/DB/LLM 실행으로 보고하지 않는다.

## 현재 자동화 범위

MCP는 개인 저장·회차 순서·기억 로드·trace 생성·증거 연결·비교를 처리한다. 앱 로그인/다음 미션 진입과 인증된 분석·퀘스트 응답 수집은 Codex의 기존 앱/서버 조작으로 이어간다. `prepare_learning_round`만으로 화면 실행이나 분석 요청이 발생하지 않는다. 영구 프로세스가 필요한 tabId 작업은 MCP 또는 `cli.cjs interactive`에서 수행한다. 파일 기반 CLI는 같은 도구를 사용한다.

## 전체 계획(whole-trace)으로 하는 A/B/C 실험

새 개인은 `create_whole_trace_learner`로 만든다. `create_learner`의 기존 provider 정책과 파일을 공유하거나 기존 trial의 정책 값을 수동 변경하지 않는다. 생성된 계획 기억을 실제 경험으로 승격하지 않는다. 실제 앱 replay와 DB receipt를 검증한 개인 경험 파일만 다음 요청의 `learnerFile`로 사용한다.

전체 계획으로 A/B/C 반복 실험을 하려면 [학습 실험 절차](../legacy/learning-trials.md)의 계정·고정 과제·증거 조건을 유지하면서 생성 경로만 다음과 같이 바꾼다.

1. A/B/C 각각 `create_whole_trace_learner({directory,learnerId,memberId,personaId,experimentId,arm})`를 호출한다. 모델·reasoning·정책은 도구가 `gpt-6-luna`/`low`/`whole-trace-v3`로 채운다.
2. `create_learning_trial` 설정에서 같은 세 learner 파일, `model:"gpt-6-luna"`, `policyVersion:"whole-trace-v3"`, 현재 `personaVersion`, 기준·평가·일반 연습 snapshot을 사용한다. 행동 예산은 `generationLimits.maxActions:100`을 사용한다. 이전 전체 계획 정책의 개인 archive·trial 파일을 바꾸지 말고 새 개인·trial을 만든다.
3. 매 회차 `prepare_whole_trace({trialFile,arm,tabId,outputPath,maxRepairs:0})`를 호출한다. B/C 맞춤 연습에는 직전 분석 `READY`와 연결된 실제 `jobFilePath`·`generationFilePath`도 제공한다. trial이 seed·페르소나·경험·생성 조건을 고정하므로 수동 `learnerFile`·`attentionExperience`를 함께 전달하지 않는다.
4. 반환된 bundle로 Luna가 전체 후보를 작성하고 `submit_whole_trace`에 제출한다. 기존 provider용 `generate_learning_round`를 여기서 다시 호출하지 않는다. 생성 결과의 `trialFile`, `arm`, `roundId`를 후속 증거 연결에 사용한다.
5. 앱 재생·DB 수신 확인 뒤 기존 `record_learning_round`로 검증된 경험을 기록한다. 실행·저장·분석 실패는 기존 `record_learning_failure`로 남긴다. 다음 맞춤 회차에는 실제 분석과 퀘스트 로딩을 완료하고 새 시작 전 탭을 전달한다. 마지막은 `compare_learning_trial`로 비교한다.

회차 준비와 후보 생성만으로 앱 로그인·재생·DB 저장·AI 분석이 실행되지는 않는다. 시스템 계산 회차의 개인 기억은 actor 앞부분에 한정하고 독립 완수 점수에서는 제외한다.
