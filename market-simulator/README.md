# Oneuldo 장보기 의도 trace와 앱 재생

페르소나 생성기는 `walkTo`, `readList`, `browse`, `openShelf`, `dragProduct`, `viewCart` 같은 행동 **의도**를 JSON으로 만든다. 개발용 Expo 웹앱이 전체 trace를 받아 기존 이동·버튼·드래그 입력 경로로 실시간 재생한다. 게임 로그는 앱의 기존 `MarketBehaviorTracker`와 큐가 기록·전송한다. 생성기와 MCP에는 `BehaviorLogRequest` 생성·변환·직접 전송 기능이 없다.

실제 LLM이 다음 행동을 선택하는 방식이 기본이다. 확률 정책은 `mode:"stochastic"`을 지정한 과거 회귀/비교 시험에서만 실행한다. 모델 설정이 없거나 호출이 실패해도 확률 행동으로 대체하지 않는다. 생성 단계에서는 기존 게임 어댑터로 의도의 실행 가능성을 확인한다. 이 검증의 가상 시간·좌표·이벤트를 앱에 전송하지 않는다. 화면 재생의 시간과 위치는 실제 앱이 결정한다.

## 구성과 시작

Node 22 이상, 설치된 `frontend/node_modules`가 필요하다. TypeScript 컴파일러와 WebSocket 라이브러리를 프런트엔드 설치에서 재사용한다. 전역 Codex 설정을 자동 변경하지 않는다.

```sh
node market-simulator/cli.cjs personas
node market-simulator/cli.cjs generate '{"mode":"stochastic","personaId":"careful-checker","seed":"sample-1","snapshotFilePath":"/tmp/mission-snapshot.json","outputPath":"/tmp/trace-1.json"}'
node market-simulator/cli.cjs validate '{"traceFilePath":"/tmp/trace-1.json","snapshotFilePath":"/tmp/mission-snapshot.json"}'
```

위 예시는 네트워크 없이 확인하는 명시적 확률 회귀 시험이다. AI 실행은 아래 LLM 설정을 사용한다. 옵션이 길면 `generate --options-file /path/options.json`을 사용한다. 결과 파일은 덮어쓰지 않는다. 생성에는 시작 전 앱 미션의 snapshot이 필요하다. snapshot은 미션·상품 버전·매장 구조·초기 재고·계산대 상태를 묶은 불변 계약이다. 같은 정책·페르소나 버전, snapshot·seed·입력 attentionExperience이면 A 모드의 trace가 같다. 새 표본에는 새 seed를 쓴다.

공용 계약은 [`marketReplayTrace.ts`](../frontend/src/game/marketReplayTrace.ts)와 [JSON Schema](../frontend/src/game/marketReplayTrace.schema.json)에 있다. Node와 앱은 같은 구조 검증기를 사용하며, Node의 `validateTrace(trace, snapshot)`은 기존 게임 어댑터를 통한 의미 검증도 수행한다. 현재 세 프로필은 모두 traceSchemaVersion `2`/policyVersion `5`를 생성한다. 앱은 저장된 v1 trace의 기존 재생을 지원한다. 임의 좌표, 이동 경로, `setPosition`, 로그 이벤트와 모르는 필드는 trace에서 거절된다. 의도의 반응시간은 이동·드래그·네트워크 대기와 별개다.

```js
require('./market-simulator/runtime.cjs').register();
const { generateTrace, generateBatch, summarizeTrace } = require('./market-simulator/src/simulator.ts');
const { validateTrace } = require('./market-simulator/src/traceValidation.ts');
const trace = await generateTrace({ mode: 'stochastic', personaId: 'careful-checker', seed: 'example', snapshot });
const validation = validateTrace(trace, snapshot);
```

`generateBatch`는 같은 snapshot을 대상으로 여러 seed의 의도 trace를 워커에서 병렬 생성한다. JSONL 각 줄은 trace만 포함한다. 앱 재생은 별도이며 실제 화면 시간만큼 걸린다. 여러 앱 탭은 서로 다른 테스트 계정으로 병렬 재생할 수 있다.

## 시험 재생 시간

새 `generate_trace`/CLI `generate`의 기본 `timingProfile`은 `compact`다. 행동 계획을 먼저 생성한 뒤 실행 시간만 조정한다. 연속 이동 전 대기는 0ms, 이동 시작 대기는 최대 350ms, 다른 행동 전 대기는 최대 1,500ms이며 이동 속도는 기본 걷기의 최소 75%다. 관찰·읽기·드래그 동작 시간, 경로, 상품 선택, 수량, 도움 요청, 실패/포기 행동은 유지한다. 시간을 맞추기 위해 과제를 조기 종료하거나 로그 시각을 바꾸지 않는다.

기존 조건 재현에는 `"timingProfile":"original"`을 명시한다. 이미 저장된 trace는 자동으로 바뀌지 않는다. 빠른 trace에는 `generation.timingProfile=compact-v1`과 원래 계획의 `sourceTraceId`를 기록하고 새 trace ID를 부여한다. 이는 시험 속도 설정이며 실제 사람의 수행 시간이나 능력 향상 지표가 아니다. 서로 다른 timing profile의 소요 시간을 학습 효과로 비교하지 않는다.

목표는 일반적인 시험을 약 3~5분 안에 완료하는 것이다. 짧은 과제를 3분까지 강제로 늘리지 않으며, 매우 긴 탐색이나 네트워크 대기는 5분을 넘을 수 있다. `timeBudgetMs`는 기존 **행동 계획 생성**의 예산이며 실제 실행을 5분에 강제 종료하는 기능이 아니다.

## 격리 설정과 앱 연결

재생은 개발용 웹앱에서 `?marketReplay=1`과 유효한 일회성 pairing이 있을 때만 켠다. 기존 앱을 운영 계정으로 재생하지 않는다. 전용 DB와 별도 인증키를 사용하는 local/staging 백엔드, 테스트 계정을 준비하고 앱의 API 설정도 그 서버로 맞춘다. `isolated:true`는 운영자의 격리 확인이며 서버 DB를 원격 검증하는 기능은 아니다. 앱은 로그인 계정을 `/api/members/me`로 확인한다.

`MARKET_REPLAY_CONFIG`에 아래 형태의 로컬 JSON 경로를 넣고 파일 권한을 `0600`으로 설정한다. 운영 환경은 지원하지 않는다. local은 loopback, staging은 정확한 HTTPS origin만 허용한다. 브릿지는 언제나 `127.0.0.1`에만 바인딩한다. `localhost`와 `127.0.0.1`, 각 포트는 서로 다른 origin이다.

```json
{
  "port": 8765,
  "appOrigins": ["http://127.0.0.1:18082"],
  "targets": [{
    "env": "local",
    "backendOrigin": "http://127.0.0.1:18080",
    "memberIds": ["dedicated-test-member-uuid"],
    "isolated": true
  }],
  "manifestPath": "/absolute/path/to/replay-manifest.jsonl"
}
```

MCP STDIO 서버를 지속 실행한다. 브릿지는 첫 연결 도구 호출 시 시작된다. 프로세스 종료나 통신 중단 시 앱 재생도 정지하므로 명령마다 서버를 다시 시작하지 않는다.

```sh
MARKET_REPLAY_CONFIG=/absolute/path/to/target.local.json node market-simulator/server.cjs
```

| 도구 | 역할 |
| --- | --- |
| `list_personas` | 현재 페르소나·버전·파라미터 조회 |
| `pair_app_session` | allowlist의 appOrigin/backendOrigin/memberId 조합에 일회성 URL 발급 |
| `list_app_sessions` | 연결된 탭, 계정, 미션 snapshot ID, 재생 준비 상태 조회 |
| `generate_trace` | personaId/seed와 tabId 또는 snapshot 또는 snapshotFilePath로 trace 생성·파일 저장 |
| `validate_trace` | trace 또는 traceFilePath를 특정 snapshot/tabId와 검증 |
| `play_trace` | 선택한 tabId에 완성된 trace 전체 전달 |
| `replay_status` | replayId로 진행 상태·앱 측정값 조회 |
| `stop_replay` | 선택한 탭의 입력 해제와 정지 요청 |

1. `pair_app_session`이 반환한 URL을 새 개발용 앱 탭으로 연다. pairing은 5분 안에 한 번만 쓸 수 있다. 토큰은 URL fragment로 전달되어 서버 요청에 포함되지 않으며 앱은 읽은 뒤 주소에서 제거하고 메모리에만 보관한다. pairing URL을 저장·공유하거나 로그에 복사하지 않는다.
2. 지정한 테스트 계정으로 로그인하고 장보기 미션 시작 화면으로 이동한다. `list_app_sessions`에서 `ready:true`, `visible:true`와 예상 계정·미션을 확인한다. 미션 시작 버튼은 trace의 `start`가 누른다.
3. `generate_trace({personaId,seed,tabId})`로 현재 미션에 맞게 생성한다. `validate_trace({traceFilePath,tabId})` 후 `play_trace({traceFilePath,tabId})`를 호출한다.
4. `replay_status({replayId})`에서 완료·실패와 움직임 측정값을 확인한다. AI 분석 요청 흐름은 `submitForReview → awaitReviewAccepted → leave`이며 분석 요청이 수락되기 전에 화면을 떠나지 않는다. 포기 흐름은 `giveUp → skipRating → leave`다.
5. 중단은 `stop_replay({tabId})`로 요청한다. 앱 정지 확인까지 탭 lease를 유지한다. 미션 변경·계정 변경·연결 상실·heartbeat 만료 시 계속 진행하지 않는다. 재연결에는 새 pairing이 필요하다. 각 스텝은 제한시간과 중단 신호를 따르며, 이미 기존 앱 핸들러가 보낸 HTTP 요청은 취소하지 못하지만 기다리던 재생은 즉시 정지하고 후속 입력을 실행하지 않는다.

일반 CLI로도 같은 프로세스를 유지할 수 있다:

```sh
MARKET_REPLAY_CONFIG=/absolute/path/to/target.local.json node market-simulator/cli.cjs interactive
```

표준입력 한 줄마다 `{"tool":"list_app_sessions","arguments":{}}` 같은 JSON을 넣는다. 탭당 한 replay만 허용하고 동일 테스트 계정의 다른 탭 동시 실행도 막는다. 서로 다른 계정과 탭은 병렬 실행한다. 브릿지 heartbeat는 2초, 통신 만료는 8초다.

## 실제 화면과 로그

앱 플레이어가 미션 snapshot을 다시 검증하고 정상 게임 루프의 joystick 입력으로 경로를 따라 움직인다. `movement.speedMultiplier`는 joystick 세기이며 전체 시간 배속이 아니다. 달리기는 허용하지 않는다. 상품은 실제 드래그 시작·이동·드롭 경로를 거치며 취소·영역 밖 드롭도 공용 계약으로 표현한다. 앱은 배경 탭과 숨겨진 화면 재생을 중단한다.

`replay-manifest.jsonl`은 권한 `0600`의 별도 로컬 실행 기록이다. trace ID/hash, replay ID, 탭/계정/백엔드, questInstanceId, 실제 앱 tracker sessionId, 상태와 앱 보고를 연결한다. 토큰·비밀번호·인증 헤더는 기록하지 않는다. `BehaviorLogRequest` 포맷이나 실제 사용자 분석 필터에 합성 출처 필드를 추가하지 않으므로 **전용 DB/계정 격리가 필수**다. 생성 trace의 metadata와 manifest가 합성 실행 출처이며 앱의 기록을 사후 꾸미지 않는다.

원활함은 화면 확인과 앱의 실제 측정값으로 판단한다. 생성기의 seed 재현이나 의도 스키마 통과가 실제 렌더링 FPS, 드래그 성공, 백엔드 수락을 증명하지 않는다. 앱이 보고한 이동 간격·프레임 간격·회전·teleport·드래그 결과와 실제 로그/응답을 별도로 검증한다.

## 페르소나와 LLM

[프로필 JSON](personas/)에 개인 배경 `character`, 자연어 `prompt`, 기존 시간·선호·지원 `parameters`, 주의·기억 `attention`, 선택·확인 습관 `shoppingStyle`을 보존한다. 현재 세 프로필 모두 제한된 관찰과 발견 기억을 사용하는 actor 정책을 쓴다.

| 프로필 | 허구의 인물과 관찰 가능한 성향 |
| --- | --- |
| `mild-intellectual-disability-adult` v5 | 지민, 32세. 구체적인 한 항목씩 처리한다. 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레는 개인 취향이며, 관심을 살핀 뒤 스스로 또는 단서에 따라 목표로 복귀한다 |
| `careful-checker` v3 | 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 안정적으로 쓰며, 낯선 배치·조작과 여러 조건에서는 시간을 갖고 실제 상품·목록·장바구니를 대조한다 |
| `quick-decider` v3 | 민수, 29세. 익숙한 초코 우유·청사과·매운 카레를 빠르게 고른다. 여러 이름·규격·수량을 함께 추적할 때 일부를 놓칠 수 있고, 확인한 불일치와 구체적인 단서로 수정한다. 관심은 짧게 살핀다 |

세 명 모두 경도 지적장애가 있는 허구의 성인이다. 인물마다 선택한 인지·적응 특성과 개인 성격·취향을 구분하고, 몇 가지 특성만 일관되게 적용한다. 세 JSON의 prompt에 두 원자료 전문과 존중 원칙을 각각 보존한다. [프로필 스키마](personas/persona.schema.json), [원자료·해시](personas/references/)와 [대응 및 한계](personas/audit.md)에 설정 출처와 행동 정책의 대응을 기록한다. 절약·빠른 결정·상품 취향은 개인 설정이며, 수치는 정책 설계값으로 사람이나 장애 집단에서 추정한 통계가 아니다.

A 모드는 각 프로필의 구조화된 설정으로 주의 상태와 제한된 발견 기억을 유지한다. `shoppingStyle`의 여섯 값은 비교 기회·최대 비교 페이지·선택 후 목록 확인·계산 전 확인·익숙한 후보의 빠른 선택·진행 방향 유지에 쓰인다. 상품에 익숙해도 현재 배치와 조작은 처음일 수 있다. 공개된 모든 상품·지도·목표를 정책이 자동으로 알고 있는 것으로 취급하지 않고, `readList`로 읽은 목표, 실제로 살핀 상품 페이지, 주변 단서와 발견 기억을 사용한다. 자연어 전체를 A가 해석하는 것은 아니다. 기본 B(AI) 모드는 구조화된 인물 설정·관찰·경험으로 실제 모델이 다음 의도를 고른다. 확률 정책의 주의/능력 수치를 전달하지 않는다.

차이는 이동 시간뿐 아니라 실제 비교 페이지, 재확인, 상품 선택과 관심 이동으로 확인한다. 가격 선호는 관찰한 대안이 있을 때 해석하고, 지정된 상품 하나만 있는 미션에서 더 싼 대체품을 고르는 것으로 과장하지 않는다. 높은 확인 성향도 완벽한 구매를 보장하지 않으며, 빠른 선택도 의무적인 오답을 뜻하지 않는다.

“이유 없는 반복 금지”는 모든 행동이 구매 목표에 직접 도움이 되어야 한다는 뜻이 아니다. 방향을 다시 찾거나, 목표 밖 관심 상품을 오래 살피거나, 같은 매대를 다시 찾고 스스로 목표로 복귀할 수 있다. 실수·이탈 quota나 좌표 흔들림으로 차이를 강제하지 않는다. `reason`은 짧은 관찰 기술이어도 되며 인물에게 자기 행동의 설명을 강요하지 않는다. `attentionTag`·`cueRefs` 같은 생성 조건은 모델 감사 정보이지 발화·측정된 심리 상태가 아니다. 발화·억양·동의 편향 등 이 게임에 없는 상호작용을 검증했다고 주장하지 않는다.

`mode:"llm"`일 때 `llm.baseUrl`, `llm.model`, API 키 환경변수 **이름** `llm.apiKeyEnv`를 설정한다. 기본 환경변수는 `MARKET_LLM_BASE_URL`, `MARKET_LLM_MODEL`, `MARKET_LLM_API_KEY`다. 기본 연결은 OpenAI 호환 `/chat/completions`이며 `llm.protocol:"ollama"`는 `/api/chat`을 사용한다. AI는 현재 가능한 조작의 choiceId를 선택하고 코드는 그 선택만 변환한다. 형식 오류만 최대 2회 다시 요청하며 재요청도 호출 상한에 포함한다. 기본 호출 상한은 300회, 요청 제한시간은 45초다. 인증키 값은 옵션·파일·로그에 넣지 않는다. 실패를 확률 정책으로 조용히 대체하지 않는다. LLM의 새로운 호출은 동일 seed 재현을 보장하지 않으며 저장된 완성 trace를 재생한다.

## 주의 정책의 회차 경험과 재생

명시적 확률 회귀 모드에서 각 인물의 `attention` 설정은 관심 단서, 관심 유지·복귀, 제한된 목표/공간 기억을 위한 설계값이다. `parameters`와 `shoppingStyle`은 각 인물의 처리·확인·선택·지원 성향을 설정하며, 실제 선택은 익숙함·부담·스트레스·지원·이미 확인한 정보에 따라 달라진다. 인물별 대응과 현재 버전은 [감사 기록](personas/audit.md)에 정리한다. 숫자를 관측 오류율이나 실제 사람의 능력으로 읽지 않는다. 선택한 특성과 개인 관심은 세션 중 유지한다.

생성 옵션 `attentionExperience`는 현재 회차의 경험 조건이다. 기본 초회는 `{"visit":"first-play"}`다. AI 반복 방문에는 `confirmedExperience`가 앱 실행과 DB 기록을 확인해 만든 경험 파일을 넘긴다:

```js
const nextTrace = await generateTrace({
  personaId: 'mild-intellectual-disability-adult', seed: 'visit-2', snapshot,
  attentionExperience: {
    visit: 'revisit',
    previousLayoutKey: confirmedExperienceArtifact.previousLayoutKey,
    memory: confirmedExperienceArtifact.memory,
    learning: confirmedExperienceArtifact.learning,
  },
});
```

확률 회귀 정책의 `layoutKey`는 생성기가 배치에서 계산한다. 이전과 같은 배치에서만 발견한 매대·앵커의 공간 기억을 재사용하고, 배치가 달라지면 공간 기억을 버리되 별도로 익힌 조작 경험은 유지한다. 매 회차의 목표는 다시 목록을 읽어 얻는다. `controlsPracticed`는 정책 action.type별 경험이며 상품 이름을 안다는 사실과 다르다.

출력 `trace.attentionExperience`에는 `{layoutKey,memory,source:"planned-trace"}`가 담긴다. 이 기억은 **계획된 trace의 경험**이며 실제 앱이 그대로 실행됐거나 사람이 학습했다는 증거가 아니다. 실행하지 않은 계획을 반복 방문의 실제 플레이 경험으로 보고하지 않는다.

trace v2의 이동은 가까운 segment 앵커를 목적지로 연결하고, `readList`는 실제 HUD 목록을 처음부터 끝까지 스크롤해 확인하며, `browse`는 선반의 공개 페이지를 살핀다. 생성 파일 옆의 `.snapshot.json`에는 동일 조건 재현에 필요한 초기 화면·게임 설정을 함께 저장한다. 완성된 trace 전체를 한 번 전달한다. 중간 앵커는 작은 RPC 이동명령으로 나누어 전송하는 방식이 아니다. 생성 단계의 주의 전환·복귀는 미리 계획되며 **실제 재생 중 상황을 새로 읽고 경로를 바꾸는 적응 분기는 없다**. 앱의 의미 검증과 정상 입력 경로는 계속 적용한다.

새 attention 생성에서 `maxActions` 또는 `timeBudgetMs`를 넘으면 기술적인 생성 중단 오류로 처리한다. 상한 때문에 끊긴 계획을 인물이 자발적으로 포기한 trace로 꾸미지 않는다. 기존 레거시 정책의 상한 처리 호환은 유지한다. 실제 `giveUp` 선택과 검토 접수 요청도 구매 성공이나 AI 분석 성공의 증거는 아니다.

## 검증

```sh
npm --prefix market-simulator run typecheck
npm --prefix market-simulator test
npm --prefix market-simulator run verify
npm --prefix market-simulator run verify:persona
npm --prefix market-simulator run verify:attention -- --count 10 --output /absolute/new-directory
npm --prefix market-simulator run verify:personalities -- --count 12 --output /absolute/new-comparison-directory
```

`verify:personalities`는 같은 미션의 세 페르소나 계획과 동일 관측 조건의 선택 검사를 비교한다. 실패 표본도 집계하며 반응 시간, 상품 비교, 목록·장바구니 확인, 관심 이동, 친숙한 상품 선택과 반품을 기록한다. 출력은 실제 앱 로그가 아닌 계획 검증 자료다.

프로필이나 정책을 편집한 뒤에는 기존 MCP/Node 프로세스를 재시작해 모듈 캐시를 갱신한다. 공유 재생 코드도 변경했다면 개발 웹 서버가 새 코드를 번들링하는지 확인하고 앱을 새로 열어 연결한다. 기존 trace는 생성 당시의 행동을 유지하므로 새 설정을 적용하려면 새 trace를 생성한다.

테스트는 공용 trace 계약·snapshot 바인딩·의미 가드·페르소나 차이와 MCP/WS 인증·탭 병렬성·연결 중단을 확인한다. 실제 웹앱 입력·프레임·드래그·백엔드 동작은 별도의 앱 통합 실행으로 확인한다. Codex 작업 흐름은 [SKILL.md](../market-persona-skill/SKILL.md)를 따른다.

### AI 행위자의 안내 전달 및 서버 연결

attention 기반 LLM 정책은 `llm.protocol: "ollama"`로 인증된 `/api/chat`을 호출할 수 있다. API 키는 `apiKeyEnv` 환경변수로만 전달하며, 원본 교환 기록에 인증 헤더는 넣지 않는다. 관찰·확인된 경험·선택지에 18,432 컨텍스트를 사용하므로 해당 크기를 지원하는 서버가 필요하다. 기본 프로토콜은 기존 OpenAI 호환 방식이다.

`ActorObservation.instructions`는 앱 시작 설명·브리핑을 첫 관찰에, 결제 안내를 결제 단계에만 전달한다. 이 필드는 해당 문장을 이해하거나 장기 학습했다는 표시가 아니다. 기존 stochastic 정책은 여전히 확률 시뮬레이터이며 문장을 이해하는 LLM으로 취급하면 안 된다. 조작/상품 기억만으로 학습했다고 판단하지 않는다. 아래 AI 경험 기록을 추가해 관찰 내용과 안내도 다음 선택에 전달한다.

### 경험 기반 AI 행위자 v1 (2026-09-30)

AI 경로는 AttentionPolicy의 확률 선택·기억 소실·감정/능력 수치를 사용하지 않는다. 고정 개인 특성(관심·강점·선호·지원 필요)을 바탕으로, 현재 관찰과 최근 6개 관찰 경험을 모델에 전달한다. 실제 실행 여부가 확인된 이전 회차 경험은 최대 24개다. 이 수는 실행 컨텍스트 예산이며 실제 사람의 기억 용량으로 보정된 값이 아니다. 전체 연구 문서를 매 행동에 반복하기보다 기존 페르소나의 구조화된 개인 특성을 전달한다.

`record-pilot-round.cjs`는 앱 완료 보고서와 DB 로그 연속성을 검증한 AI 재생에만 `experience.learning`을 만든다. 저장 내용은 실제 실행한 목록 읽기·상품 선택/제거·장바구니 열기와 해당 화면의 안내다. 표시 내용은 바인딩된 스냅샷에서 재구성하므로 실제로 읽고 이해했음을 뜻하지 않는다. 가상 계획의 경험은 같은 계획 생성 안에서만 쓰며 장기 경험으로 승격하지 않는다. 분석의 숨은 정답이나 성공 판정을 주입하지 않는다.

다음 `generate_trace`에는 `attentionExperience: {visit, previousLayoutKey, memory, learning}`을 전달한다. 첫 방문/확률 모드에는 learning을 허용하지 않으며, 앱 탭에 실행할 때 계정도 일치해야 한다. 배운 전략을 정답 문장으로 삽입하거나 반복마다 오류 확률을 낮추지 않는다. AI가 구체적인 경험을 참고하는 과정이며 실제 인간의 학습/망각/전이를 입증한 모델이 아니다. 별도 실제 참여자 자료로 보정하고 평가해야 한다.

실행 확인 경험에는 읽은 목록, 표시 안내, 열어 본 상품 페이지, 담기/빼기, 장바구니 확인을 담는다. 현재 계획 중 기억에도 선택한 이동/매대와 관찰한 상품을 함께 보관한다. 행동 이름만 남겨 무엇을 봤는지 잃는 문제를 줄이기 위한 변경이다. 실제 요청 검사와 미해결 탐색 반복은 [2026-09-30 검증 기록](../docs/ai/actor-learning-2026-09-30.md)을 따른다.


## 관찰 기억 보존 v2 (2026-09-30)

`episodic-choice-v2`는 최근 행동 6개와 별개로 현재 회차에서 실제 표시된 시작/결제 안내, 마지막으로 읽은 목록, 발견 장소·상품·통로, 이동한 연결과 목적지 방문 횟수를 모델에 전달한다. 위치 단서는 관찰 당시 위치 기준임을 표시하며 현재 화면 단서를 우선한다. 아직 보지 않은 지도나 목표 상품 위치를 계산해 넣지 않는다.

AI는 짧은 `currentTask`를 직접 출력할 수 있다(최대 160자). 다음 요청의 `actorChosenTask`로 이어지며 코드가 목표를 대신 선택하지 않는다. 이 문장은 가상 행위자의 임시 의도이며 실제 사람의 발화나 내면 사고를 측정한 것이 아니다. 과거 회차의 현재 작업과 목표 목록은 새 회차에 자동 복사하지 않는다.

장소·상품 기록은 컨텍스트 크기를 제한하는 버퍼다(통로 256, 장소 64, 상품 96, 최근 이동 48). 이는 임상적 기억/망각 모형이 아니다. 정보가 입력에 있다는 사실과 그것을 이해·활용하는 능력은 구분한다. 모델은 기록을 잘못 해석하거나 재확인할 수 있으며 자동 성공률 증가나 정답 행동 대체는 없다.

[보완 및 비교 시험](../docs/ai/actor-memory-v2-2026-09-30.md)


후속 `episodic-choice-v3`는 위 기억 보존에 동작 피드백을 추가한다. `lookAround`/`pause`의 선택지에는 제자리 대기이며 화면을 회전/확장하지 않는다는 설명을 붙인다. 대기 전후 관찰이 동일하면 새 장소/상품이 보이지 않았음을 결과에 기록한다. 자동 행동 교체나 반복 금지는 없다.


최종 `episodic-choice-v4`는 이동 선택지에 현재 방향·거리와 기억에 기록된 도착 횟수/현재 위치 여부를 같이 표시한다. 별도 목록의 통로 ID를 대조하지 않아도 기존 관찰 이력을 확인할 수 있다. 행동 후보를 정답 기준으로 정렬하거나 방문한 통로를 제거하지 않는다.
