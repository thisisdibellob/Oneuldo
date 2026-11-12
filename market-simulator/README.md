# Oneuldo 장보기 의도 trace와 앱 재생

장보기 미션에서 페르소나의 행동 trace를 생성·검증하고, 개발용 앱에서 재생하는 Node 도구다. 현재 주력 생성 경로는 Luna 전체 계획(whole-trace)의 결정별 작성 모드다: `prepare_whole_trace` → `begin_whole_trace_authoring` → `append_whole_trace_decision` 반복 → `finish_and_submit_whole_trace`. 에이전트가 따르는 절차와 계약은 [market-persona-skill](../market-persona-skill/SKILL.md)에 있고, 이 문서는 설치·연결·실행·테스트를 다룬다.

## 문서 지도

- [Luna 전체 계획 상세](docs/whole-trace.md): 결정별 작성, 후보 작성·제출 계약, 방향 이동 옵션, 이동 그래프 진단
- [페르소나 성향 검증 상세](docs/persona-validation.md): 성향 v2/v3 프로필 요청 예시와 공통 절차
- [변경 이력과 레거시 경로](docs/history.md): feedback-choice v1~v13, 2026-09 경험·학습 실험 기록
- [페르소나 정의와 출처](personas/audit.md): 실행 JSON, 읽기용 프롬프트, 이전 버전(`personas/history/`)

## 구성과 시작

Node 22 이상, 설치된 `frontend/node_modules`가 필요하다. TypeScript 컴파일러와 WebSocket 라이브러리를 프런트엔드 설치에서 재사용한다. 전역 Codex 설정을 자동 변경하지 않는다.

```sh
node market-simulator/cli.cjs personas
node market-simulator/cli.cjs generate '{"mode":"stochastic","personaId":"careful-checker","seed":"sample-1","snapshotFilePath":"/tmp/mission-snapshot.json","outputPath":"/tmp/trace-1.json"}'
node market-simulator/cli.cjs validate '{"traceFilePath":"/tmp/trace-1.json","snapshotFilePath":"/tmp/mission-snapshot.json"}'
```

위 예시는 네트워크 없이 확인하는 명시적 확률 회귀 시험이다. AI 실행은 아래 LLM 설정을 사용한다. 옵션이 길면 `generate --options-file /path/options.json`을 사용한다. 결과 파일은 덮어쓰지 않는다. 생성에는 시작 전 앱 미션의 snapshot이 필요하다. snapshot은 미션·상품 버전·매장 구조·초기 재고·계산대 상태를 묶은 불변 계약이다. 같은 정책·페르소나 버전, snapshot·seed·입력 attentionExperience이면 A 모드의 trace가 같다. 새 표본에는 새 seed를 쓴다.

공용 계약은 [`marketReplayTrace.ts`](../frontend/src/game/marketReplayTrace.ts)와 [JSON Schema](../frontend/src/game/marketReplayTrace.schema.json)에 있다. Node와 앱은 같은 구조 검증기를 사용하며, Node의 `validateTrace(trace, snapshot)`은 기존 게임 어댑터를 통한 의미 검증도 수행한다. 세 프로필의 traceSchemaVersion은 `2`이며 provider/확률 policyVersion은 `5`, Codex 증분/전체 계획은 `6`이다. 앱은 저장된 v1 trace의 기존 재생을 지원한다. 임의 좌표, 이동 경로, `setPosition`, 로그 이벤트와 모르는 필드는 trace에서 거절된다. 의도의 반응시간은 이동·드래그·네트워크 대기와 별개다.

```js
require('./market-simulator/runtime.cjs').register();
const { generateTrace, generateBatch, summarizeTrace } = require('./market-simulator/src/simulator.ts');
const { validateTrace } = require('./market-simulator/src/traceValidation.ts');
const trace = await generateTrace({ mode: 'stochastic', personaId: 'careful-checker', seed: 'example', snapshot });
const validation = validateTrace(trace, snapshot);
```

`generateBatch`는 같은 snapshot을 대상으로 여러 seed의 의도 trace를 워커에서 병렬 생성한다. JSONL 각 줄은 trace만 포함한다. 앱 재생은 별도이며 실제 화면 시간만큼 걸린다. 여러 앱 탭은 서로 다른 테스트 계정으로 병렬 재생할 수 있다.

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
| `begin_feedback_plan` | 첫 방문 세션을 만들고 현재 화면·개인·기억의 첫 frame 반환 |
| `step_feedback_plan` | 단일 선택 적용 후 결과와 다음 frame 반환, 같은 requestId의 중복 실행 방지 |
| `observe_feedback_plan` | 통신 중단 뒤 현재 frame 복구 |
| `finalize_feedback_plan` | 완성 파일과 접수·실행 수 및 시간 반환 |
| `generate_trace` | personaId/seed와 tabId 또는 snapshot 또는 snapshotFilePath로 trace 생성·파일 저장 |
| `prepare_whole_trace` | 전체 상태·행동 계약·페르소나·확인된 관련 기억을 불변 bundle로 준비 |
| `submit_whole_trace` | Luna의 전체 후보 배열을 기존 게임 로직으로 컴파일·검증·저장 |
| `repair_whole_trace` | 수정할 decisions suffix만 제출; 서버가 요청 정보를 채우고 기존 수정 1회 제한 적용 |
| `whole_trace_status` | 전체 계획 요청의 상태·실패 진단·저장 결과 조회 |
| `prepare_persona_validation` | 성향 조합·조건·seed의 검증 슬롯 준비; 기존 v2 run 호환 |
| `check_persona_validation_readiness` | 완료·대조군·짝·최대 유효 쌍·부족 슬롯 읽기 전용 점검 |
| `measure_persona_validation` | 공통 성향 지표·전체 목표 결과·관찰 기회·한 축 비교 측정 |
| `prepare_blind_review` | 공통 성향 판정 지침과 A/B 익명 표본 준비 |
| `submit_blind_review` | 다섯 성향 수준·unknown 답안 채점; legacy 인물 답안 호환 |
| `persona_validation_report` | 네 평가 축·블라인드 결과·한계의 JSON·한국어 보고서 |
| `create_whole_trace_learner` | whole-trace-v3 / gpt-6-luna / low에 묶인 새 개인 파일 생성 |
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

## 시험 재생 시간

새 `feedback-choice-v5`와 명시적 v2/v3/v4/v6는 `activity-duration-v2`를 기록한다. 모든 행동 전 `reactionDelayMs`는 0이고 배우는 `choiceId,durationMs,reason,memory`를 응답하며 v5/v6의 담기·내려놓기에는 `choiceParameters`도 포함한다. `moveDirection`의 durationMs는 배회·회피 모드에서도 모델이 고르는 조이스틱 입력 지속 시간 100~2000ms다. 일반 조작은 0, pause/lookAround/readList/browse는 100~120000ms, viewCart/viewHelp는 화면을 연 뒤 확인할 0~120000ms다. `reason`은 짧은 공개 행동 서술이며 목적의 정당화가 아니다. 목록 읽기 2초 같은 고정 활동 시간도 배우가 선택한 값으로 대체한다. 실제 보행·드래그·UI 전환·서버 접수 시간은 유지하며 확인 시간과 중복하지 않는다. 구형 delayMs 요청은 거절한다. 명시적 v2에는 자동 배회·회피를 추가하지 않으며 명시적 v3는 `exploration-v1`을 유지한다. 명시적 feedback v1은 `activity-duration-v1`과 `durationMs:0`의 기존 anchor 이동을 유지하고, 저장된 v1/v2/v3 및 actor-preserved-v1 trace는 원래 의미로 재생한다. [시간 계약과 예시](../market-persona-skill/legacy/feedback-plan.md#행동-시간)를 참고한다.

`whole-trace-v3`의 `prepare_whole_trace`는 `timingProfile` 기본값과 허용값이 `original`이며 명시적 `compact`는 거절한다. Luna가 판단마다 제출한 `delayMs`와 프로필 보행 기준을 유지하며 임의 시간 지터나 compact 압축을 적용하지 않는다. 완성 trace에는 `generation.timingProfile:"actor-preserved-v1"`·`generation.actorStateVersion:"1"`을 기록한다. 반응 지연은 실제 이동·읽기·드래그·서버 대기와 별개이며 이동은 기존 물리적 보행과 어댑터의 한 번에 32 이하 이동 입력 상한을 계속 따른다. 생성 시간 예산은 판단 시간을 일괄 단축하는 지침이 아니다.

명시적 feedback/whole-trace 정책이 없는 기존 `generate_trace`/CLI `generate`의 기본 `timingProfile`은 `compact`다. 행동 계획을 먼저 생성한 뒤 실행 시간만 조정한다. 연속 이동 전 대기는 0ms, 이동 시작 대기는 최대 350ms, 다른 행동 전 대기는 최대 1,500ms이며 이동 속도는 기본 걷기의 최소 75%다. 관찰·읽기·드래그 동작 시간, 경로, 상품 선택, 수량, 도움 요청, 실패/포기 행동은 유지한다. 시간을 맞추기 위해 과제를 조기 종료하거나 로그 시각을 바꾸지 않는다.

기존 조건 재현에는 `"timingProfile":"original"`을 명시한다. 이미 저장된 trace는 자동으로 바뀌지 않는다. 빠른 trace에는 `generation.timingProfile=compact-v1`과 원래 계획의 `sourceTraceId`를 기록하고 새 trace ID를 부여한다. 이는 시험 속도 설정이며 실제 사람의 수행 시간이나 능력 향상 지표가 아니다. 서로 다른 timing profile의 소요 시간을 학습 효과로 비교하지 않는다.

기존 compact 시험의 목표는 일반적인 재생을 약 3~5분 안에 완료하는 것이다. 짧은 과제를 3분까지 강제로 늘리지 않으며, 매우 긴 탐색이나 네트워크 대기는 5분을 넘을 수 있다. 전체 계획의 판단 지연을 이 목표에 맞춰 줄이지 않는다. `timeBudgetMs`는 기존 **행동 계획 생성**의 예산이며 실제 실행을 5분에 강제 종료하는 기능이 아니다.

## 페르소나와 LLM

[프로필 JSON](personas/)에 개인 배경 `character`, 자연어 `prompt`, 기존 시간·선호·지원 `parameters`, 주의·기억 `attention`, 선택·확인 습관 `shoppingStyle`을 보존한다. 같은 프로필이 전체 계획과 증분 정책에 사용된다. 전체 계획도 인물의 선택 지식에는 제한된 화면·발견 기억을 적용하지만 모델 자체에는 전체 세계 참고 자료가 있으므로 두 모드의 정보 노출 조건을 같다고 보고하지 않는다. 익숙한 상품 선호·시작 습관은 현재 매장의 상품 위치나 재고를 알려주는 공간 기억이 아니다.

| 프로필 | 허구의 인물과 관찰 가능한 성향 |
| --- | --- |
| `mild-intellectual-disability-adult` v5 | 지민, 32세. 구체적인 한 항목씩 처리한다. 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레는 개인 취향이며, 관심을 살핀 뒤 스스로 또는 단서에 따라 목표로 복귀한다 |
| `careful-checker` v3 | 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 안정적으로 쓰며, 낯선 배치·조작과 여러 조건에서는 시간을 갖고 실제 상품·목록·장바구니를 대조한다 |
| `quick-decider` v3 | 민수, 29세. 익숙한 초코 우유·청사과·매운 카레를 빠르게 고른다. 여러 이름·규격·수량을 함께 추적할 때 일부를 놓칠 수 있고, 확인한 불일치와 구체적인 단서로 수정한다. 관심은 짧게 살핀다 |

세 명 모두 경도 지적장애가 있는 허구의 성인이다. 인물마다 선택한 인지·적응 특성과 개인 성격·취향을 구분하고, 몇 가지 특성만 일관되게 적용한다. 세 JSON의 prompt에 두 원자료 전문과 존중 원칙을 각각 보존한다. [프로필 스키마](personas/persona.schema.json), [원자료·해시](personas/references/)와 [대응 및 한계](personas/audit.md)에 설정 출처와 행동 정책의 대응을 기록한다. 절약·빠른 결정·상품 취향은 개인 설정이며, 수치는 정책 설계값으로 사람이나 장애 집단에서 추정한 통계가 아니다.

A 모드는 각 프로필의 구조화된 설정으로 주의 상태와 제한된 발견 기억을 유지한다. `shoppingStyle`의 여섯 값은 비교 기회·최대 비교 페이지·선택 후 목록 확인·계산 전 확인·익숙한 후보의 빠른 선택·진행 방향 유지에 쓰인다. 상품에 익숙해도 현재 배치와 조작은 처음일 수 있다. 공개된 모든 상품·지도·목표를 정책이 자동으로 알고 있는 것으로 취급하지 않고, `readList`로 읽은 목표, 실제로 살핀 상품 페이지, 주변 단서와 발견 기억을 사용한다. 자연어 전체를 A가 해석하는 것은 아니다. 기본 B(AI) 모드는 구조화된 인물 설정·관찰·경험으로 실제 모델이 다음 의도를 고른다. 확률 정책의 주의/능력 수치를 전달하지 않는다.

차이는 이동 시간뿐 아니라 실제 비교 페이지, 재확인, 상품 선택과 관심 이동으로 확인한다. 가격 선호는 관찰한 대안이 있을 때 해석하고, 지정된 상품 하나만 있는 미션에서 더 싼 대체품을 고르는 것으로 과장하지 않는다. 높은 확인 성향도 완벽한 구매를 보장하지 않으며, 빠른 선택도 의무적인 오답을 뜻하지 않는다.

“이유 없는 반복 금지”는 모든 행동이 구매 목표에 직접 도움이 되어야 한다는 뜻이 아니다. 방향을 다시 찾거나, 목표 밖 관심 상품을 오래 살피거나, 같은 매대를 다시 찾고 스스로 목표로 복귀할 수 있다. 실수·이탈 quota나 좌표 흔들림으로 차이를 강제하지 않는다. `reason`은 짧은 관찰 기술이어도 되며 인물에게 자기 행동의 설명을 강요하지 않는다. `attentionTag`·`cueRefs` 같은 생성 조건은 모델 감사 정보이지 발화·측정된 심리 상태가 아니다. 발화·억양·동의 편향 등 이 게임에 없는 상호작용을 검증했다고 주장하지 않는다.

`mode:"llm"`일 때 `llm.baseUrl`, `llm.model`, API 키 환경변수 **이름** `llm.apiKeyEnv`를 설정한다. 기본 환경변수는 `MARKET_LLM_BASE_URL`, `MARKET_LLM_MODEL`, `MARKET_LLM_API_KEY`다. 기본 연결은 OpenAI 호환 `/chat/completions`이며 `llm.protocol:"ollama"`는 `/api/chat`을 사용한다. AI는 제시된 조작의 choiceId를 선택하고 코드는 그 선택을 변환한다. `feedback-choice-v4`에서는 실제 막혔던 방향을 잠시 제외하되 현재 가능한 비이동 조작을 유지한다. 명시적 v3는 기존 배회·회복 턴의 방향 이동 제한을 유지한다. 형식 오류만 최대 2회 다시 요청하며 재요청도 호출 상한에 포함한다. 기본 호출 상한은 300회, 요청 제한시간은 45초다. 이 호출 상한은 feedback의 최대 행동 수 100과 별개다. 인증키 값은 옵션·파일·로그에 넣지 않는다. 실패를 확률 정책으로 조용히 대체하지 않는다. LLM의 새로운 호출은 동일 seed 재현을 보장하지 않으며 저장된 완성 trace를 재생한다.

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

새 attention 생성에서 `maxActions`·`timeBudgetMs` 또는 LLM `maxCalls`를 넘으면 기술적인 생성 중단 오류로 처리한다. 이는 아래 명시적 v9·v10·전체 계획의 행동 100회 관찰 상한과 별개여서, 해당 모드에서도 너무 작은 기술 예산은 100회 전에 오류를 낼 수 있다. 오류로 끊긴 계획을 인물이 자발적으로 포기한 trace로 꾸미지 않는다. 기존 레거시 정책의 상한 처리 호환은 유지한다. 실제 `giveUp` 선택과 검토 접수 요청도 구매 성공이나 AI 분석 성공의 증거는 아니다.

## 오프라인 요청 호스트의 수명

macOS/Linux에서 `host-start`는 호출자의 stdin을 받지 않는 독립 프로세스를 시작한다. 배우 작업이나 `host-call` 클라이언트가 끝나도 준비한 요청은 같은 호스트 메모리에 남는다. 호스트 디렉터리는 부모가 존재하는 새 경로를 지정하며, 종료된 디렉터리도 다시 사용하지 않는다.

```sh
node market-simulator/cli.cjs host-start /absolute/new-host-directory
node market-simulator/cli.cjs host-status /absolute/new-host-directory
node market-simulator/cli.cjs host-call /absolute/new-host-directory --options-file /absolute/prepare-call.json
node market-simulator/cli.cjs host-close /absolute/new-host-directory
```

준비 담당자의 호출 파일은 `{"operationId":"prepare-01","tool":"prepare-whole","arguments":{"personaId":"...","seed":"...","snapshotFilePath":"/absolute/snapshot.json","maxRepairs":0}}` 형태다. 준비 응답의 requestId와 실제 hostDirectory를 해당 배우의 context.json에 저장한 다음, 작성·제출에는 위의 `author-whole` 진입점을 사용한다. 별칭과 정식 도구명은 같은 도구로 해석한다. `hostId`·`requestId`·`inputHash`·operationId는 후보 밖의 실행 출처에도 기록한다. 호스트의 직접 호출 API와 기존 MCP 인자 계약은 유지한다.

작성 요청을 전달하기 전과 제출 전에 `host-status`로 같은 호스트와 요청이 살아 있는지 확인한다. 응답 연결만 끊겼다면 **같은 살아 있는 호스트에 같은 operationId와 변경 없는 입력**으로 재전송한다. 진행 중이거나 끝난 동일 작업의 결과를 공유하므로 제출·수정 예산을 다시 소비하지 않는다. 같은 ID의 변경된 입력은 거절한다. 지원하는 candidate/repair/snapshot/trace 파일은 호출 시 내용으로 고정해 해시에 반영한다. 이는 전송 재시도이며 AI 재생성이나 기술 수정 허가가 아니다.

독립 호스트는 `list_personas`, whole-trace 준비·작성·제출·수정·상태, `validate_trace`만 지원한다. `tabId`, learner/trial/job/generation 파일이나 persona-validation 디렉터리 작업은 지원하지 않으며 기존 CLI/MCP 경로를 사용한다. 이 경계로 요청 파일을 대기 중에 다시 읽어 다른 내용으로 실행하는 일을 막는다. 앱 실행이나 provider 생성은 호스트 호출로 시작할 수 없다.

`status.json`은 PID·시작/종료·요청 상태·attempts를, `events.jsonl`은 작업 ID·상태와 관측된 종료 신호를 기록한다. `process.log`에는 프로세스 오류가 남는다. 접근 자격 파일 `connection.json`은 공유하지 않는다. `host-close`와 SIGTERM은 대기 작업을 마친 뒤 종료하며, SIGKILL 등 기록하지 못한 종료는 원인 불명 `unavailable`로 보고한다. 기록은 체크포인트가 아니므로 종료한 호스트의 요청을 자동 복원하지 않는다. 새 호스트는 이전 requestId를 모르며, 기존 후보의 requestId를 바꾸거나 새 요청으로 옮겨 제출하지 않는다.

종료 요청의 응답은 `state:"closing"`으로 종료 접수를 알린다. 호스트는 접수된 작업과 서비스 정리 뒤에도 이 응답 및 작업 응답의 writable `finish` 또는 연결 종료를 기다린 다음 소켓을 제거한다. 응답을 읽지 않는 클라이언트에는 최대 5초의 전송 대기만 허용하며, 초과 시 `host_response_drain_timeout`을 기록한다. 접수 응답은 서비스 정리의 성공 보증이 아니므로 최종 `host-status`/종료 기록의 closed·exitCode를 따로 확인한다. 서비스 정리가 실패해도 접수 응답 전송을 기다린 뒤 failed·exitCode 1로 기록한다.

### 소켓 없는 파일 mailbox

`node market-simulator/whole-trace-mailbox.cjs serve /absolute/new-owner --prepare-file /absolute/prepare.json`은 감독자가 소유하는 단일 whole-trace 요청 프로세스다. prepare 파일에는 readiness의 인자를 그대로 담는다. 배우는 자기 `prepare-response.json`만 받고, `call /absolute/new-owner --operation-file /absolute/operation.json`으로 기존 begin/menu/append 도구를 호출한다. 요청 파일은 `{operationId,tool,arguments}`이며 requestId는 owner가 고정한다.

최종 `finish_and_submit_whole_trace`의 인자는 `{}`다. finish가 반환한 후보 객체 하나만 단일 JSON으로 원자적으로 저장하고, 재파싱·동일성 검사·기존 submit·status·저장 trace validate를 마쳐야 `completion.json`을 기록하고 정상 종료한다. JSONL에서 후보를 추출하거나 배우에게 EOF 종료를 맡기지 않는다. 전달 오류와 배우 클라이언트 종료는 준비 요청을 닫지 않으며, 같은 operationId의 동일 입력 재조회는 행동을 다시 실행하지 않는다. 감독자만 `abort /absolute/new-owner --reason "사유"`로 중단할 수 있다. 이 방식은 소켓을 열거나 이전 요청을 복원하지 않는다. 행동·프로필·검증 명세·repair 예산은 그대로이며 세부 절차는 [전체 계획 전달 규약](../market-persona-skill/references/whole-trace.md#소켓-없는-단일-요청-전달)을 따른다.

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

## 행동 100회 상한과 시스템 계산

이 절의 100회 관찰과 자동 계산은 명시적으로 선택한 `episodic-choice-v9`, `episodic-choice-v10`, `whole-trace-v3`에 적용된다. 기본 `generate_trace`의 `episodic-choice-v4`는 기존 프롬프트·선택 방식·기술 실행 상한을 유지한다.

AI 정책 v9는 `character`와 함께 원자료에서 정리한 짧은 실행 원칙(`src/actorInstructions.ts`)을 보낸다. 모델이 선택하는 첫 100회에는 개인의 취향·강점·선택권, 낯선 상황에서의 배회와 관심 전환을 유지한다. 최단 경로나 정답을 주지 않고 보이는 조작 전체를 계속 선택할 수 있다. 선택 ID는 행동에 고정되고 표시 순서만 seed/판단 순번으로 정해져, 좌표 정렬의 첫 후보가 계속 같은 방향을 유도하지 않게 한다. 이 seed는 표시 순서의 재현용이며 원격 모델의 동일 출력을 보장하지 않는다.

`ActorActivityMonitor`는 모델에게 전달된 관측만 사용한다. 새 통로·상품·도움 문구·목록·상품 페이지·장바구니 상태와 처음 도착한 장소를 기록한다. 단순 시간 경과, reason/currentTask 문구 변경, 이미 본 화면의 열기/닫기는 새 발견으로 세지 않는다. 구매 정답 여부는 판단하지 않는다. 현재 결과에 새 관측 여부, 직전 장소 복귀, 도착 횟수와 같은 이동 횟수를 붙인다.

v9는 반복과 새 관측이 없던 구간을 진단 기록으로만 사용한다. 반복 횟수 때문에 재검토를 지시하거나 다른 행동으로 교체하거나 조기에 종료하지 않는다. 모델이 선택해 적용한 상위 행동을 최대 100회 관찰하며 `start`, 이동을 실행하는 세부 입력, 이후 시스템 처리 단계는 이 수에서 제외한다. 형식 오류 재요청은 모델 호출 예산을 사용하지만 적용된 행동으로 세지 않는다. 모델이 100번째 행동에서 제출·자발적 `giveUp`을 선택한 경우도 그대로 따른다. 100회는 관찰 범위이며 장애의 임상적 행동 기준이 아니다.

100회 후에도 진행 중이면 **당시 장바구니를 그대로 계산·분석 접수하는 시스템 구간**을 추가한다. 상품을 추가·제거하거나 목표에 맞게 보정하지 않으며, 빈 장바구니도 그대로 제출한다. 기존 이동 입력으로 계산대에 도착하고 필요하면 직원에게 계산대 호출을 요청한다. 계산을 거쳐 `submitForReview → awaitReviewAccepted → leave` 순서로 끝내므로 분석 요청이 수락되기 전에 나가지 않는다. 이동은 기존 충돌·보행 가드를 유지하고 순간이동을 사용하지 않는다. 시스템 구간 길이는 현재 위치·열린 화면·직원 유무에 따라 달라지므로 전체 trace 길이가 104단계로 고정되지는 않는다.

`generation.systemCompletion = {reason:"action-limit", afterDecisions:100, actionLimit:100, firstStepId, checkoutId, cartAtStart}`에 시스템 처리의 시작과 계산 대상·장바구니를 남긴다. `firstStepId`부터의 이동·직원 호출·제출은 시스템이 계획한 것으로, 페르소나가 스스로 계산대를 찾았거나 과제를 완주한 능력의 증거가 아니다. 실행·DB 증거와 실제 제출 장바구니가 `cartAtStart`와 일치하는지 검증한다. 앱 보고서에 시작 경계가 있으면 메타데이터·관측 장바구니도 대조한다.

검증된 회차는 `outcome:'assisted-completion'`, `learningEligible:true`, `learningScope:'actor-prefix'`, `analysisEligible:true`, `performanceEligible:false`로 측정한다. 개인 기억의 controls/episodes에는 `firstStepId` 이전만 반영하므로 자동 계산 경로·안내·직원 호출·제출은 다음 회차 경험에 들어가지 않는다. 실제 제출된 구매 내용은 기존 방식으로 측정하되, 실험 회차는 `status:'assisted-submission'`, `metrics:null`로 기록해 독립 완수의 기준/평가 비교에서 제외한다. 이 회차도 다음 분석과 퀘스트 연결은 이어갈 수 있다. 단, `analysisEligible`은 분석 완료 증거가 아니며 실제 서버의 `READY`와 연결된 AI 퀘스트는 별도로 확인해야 한다.

기존 v6/v7의 반복 정체 종료와 v8의 `giveUp → skipRating → leave` 상한 종료는 `generation.controlledStop`으로 계속 구분한다. v9의 시스템 계산 메타데이터와 섞거나 지워서 자발적 수행으로 바꾸지 않는다. 기술 오류로 생성이 중단된 자료도 시스템 계산을 완료한 trace로 보고하지 않는다.

LLM 오류, 너무 작은 `maxActions`/`maxCalls`, 예정 시간 상한 등은 여전히 기술적 생성 실패다. 100회 상한은 완성 trace를 보장하거나 구매·분석 성공을 보장하는 장치가 아니다. 이 v9 종료 처리로 기존 `mode:"stochastic"` 회귀 정책의 선택과 종료 방식을 바꾸지는 않았다. 생성·검증만 요청받으면 저장된 snapshot으로 trace를 만들고 검증까지만 수행하며, 앱 재생·백엔드 전송·분석 요청은 실행하지 않는다.

MCP/CLI 생성은 모델 호출 전에 `<trace 경로>.generation/`에 snapshot과 인증정보 없는 설정을 보존한다. 관찰·선택·결과 체크포인트와 최종 상태를 기록하므로 실패한 경우도 조사할 수 있다. 미완성 자료는 완성 trace나 실제 수행 경험으로 승격하지 않는다. 진단 자료에도 실험용 미션 내용이 있으므로 공유할 때 검토한다. 키·인증 헤더·원본 모델 교환/추론은 저장하지 않는다.

정책 변경 전후를 동일 학습 실험으로 섞지 않는다. 기존 프로세스를 재시작하고 새 개인/실험을 만든 뒤 동일 정책에서 비교한다. v9 trace는 새 스키마를 지원하는 앱 번들로 재생해야 한다. 기존 v6/v7의 `persistent-stagnation` 및 v8의 `action-limit` 종료 trace는 계속 검증할 수 있으며, 저장된 과거 trace를 v9 정책으로 소급 변경하지 않는다.
