# Oneuldo 장보기 합성 로그 시뮬레이터

Expo 화면을 켜지 않고 기존 `createMarketAgentAdapter`로 게임을 실행한다. 확률 정책(A)이 기본이며, 매 행동을 실제 LLM에 맡기는 옵션(B)이 있다. 이동·상품 선택·계산·재시도는 실제 게임 상태머신을 거친다. 완성된 에피소드와 기존 행동 트래커 매핑으로 생성한 `BehaviorLogRequest[]`를 JSONL 한 줄에 함께 저장한다.

## 시작

Node 22 이상과 설치된 `frontend/node_modules`가 필요하다. 런타임은 프런트엔드의 TypeScript 컴파일러를 재사용한다. 앱·브라우저·백엔드·로그인은 생성에 필요하지 않다.

```sh
node market-simulator/cli.cjs personas
node market-simulator/cli.cjs episode '{"personaId":"careful-checker","seed":"sample-1","outputPath":"/tmp/market-one.jsonl"}'
node market-simulator/cli.cjs batch '{"count":100,"seed":"batch-1","environmentSeed":"same-store","personaMix":{"careful-checker":1,"quick-decider":1},"concurrency":4,"outputPath":"/tmp/market-batch.jsonl"}'
node market-simulator/cli.cjs validate '{"batchFilePath":"/tmp/market-batch.jsonl"}'
```

옵션 JSON이 길면 `<command> --options-file /path/options.json`을 사용한다. 결과 파일은 덮어쓰지 않는다. `difficulty`는 기존 게임의 `family` 또는 `exact`다. 매장 seed와 정책 seed를 분리하므로 같은 매장에서의 행동 차이도 비교할 수 있다. 페르소나는 [personas](personas/)의 JSON(설명, 자연어 프롬프트, 확률·시간·상품 선호 파라미터)으로 정의한다.

확률 수치는 합성 정책의 설계값이며 사람이나 장애 집단에서 추정한 통계가 아니다. `mild-intellectual-disability-adult` v2는 사용자 제공 두 원자료와 일관된 한 성인의 설정을 사용한다. `careful-checker`와 `quick-decider`는 비교용 행동 프로필이다. 원문·해시와 근거 링크는 [references](personas/references/), 파라미터 대응과 반영 범위는 [감사 문서](personas/audit.md)에 보존한다. 실행용 JSON이 원문의 근거를 대체하지 않는다.

v2는 선택한 네 가지 특성을 세션 내내 유지한다. 기존 기본 파라미터에 개인의 익숙한 활동·상품, 관찰한 경험, 기억 부담, 실패로 누적되는 부담과 확인·도움의 효과를 적용한다. `personaContext.ts`의 수치는 합성 상태 추정이며 심리 측정치가 아니다. A 모드는 이 상태에 따른 확률 근사이고, B 모드는 원문 전체·인물 설정·누적 경험·최근 관찰을 받은 모델이 매 행동을 선택한다. 두 모드 모두 아직 관찰하지 않은 상품 위치·재고나 숨겨진 정답을 사용하지 않는다.

`reason`에는 행동의 관찰 가능한 단서와 선택 분기, 짧은 상황 수치를 기록한다. 이동은 기존 충돌 검사와 32px 제한을 유지한다. 질문 문구·유도성·동의/거절 대화가 없는 게임에서 동의 편향을 고정 확률로 추가하지 않는다. 발화·억양·관계·성적 자기결정 같은 항목은 원문에 보존하지만 현재 게임 로그로 검증했다고 주장하지 않는다.

## 모듈과 파일 형식

```js
require('./market-simulator/runtime.cjs').register();
const { generateEpisode, generateBatch, validateEpisodeReplay } = require('./market-simulator/src/simulator.ts');
const result = await generateEpisode({ personaId: 'careful-checker', seed: 'example' });
// result = { run, episode, behaviorLogs, trace, summary }
```

`episode`는 기존 `exportMarketEpisode()` 결과, `behaviorLogs`는 프런트엔드 타입의 로그 배열이다. `run`은 정책 시드·버전·모드·실행 제한을 담는다. `trace`는 행동 요청·가상 지연시간·짧은 이유·관찰 및 실행 출처 해시를 보존한다. `summary`는 이동 거리, 선택 오류, 재확인·도움, 반응시간과 행동 지문을 포함한다. 병렬 확률 배치에서도 파일 순서와 seed 파생은 일정하다.

새 생성은 `run.policyVersion: "2"`, 확률 정책의 provenance는 `agentModel: "stochastic-policy/2"`로 구분한다. 페르소나 v2는 별도 `personaVersion`에 기록한다. 저장된 정책 v1 결과도 `validateEpisodeReplay`로 오프라인 검증할 수 있다. 정책·페르소나 버전이 바뀌면 같은 seed의 새 생성 결과도 달라질 수 있으므로 과거 결과의 검증에는 저장된 전체 결과를 사용한다.

검증은 프런트엔드 `behaviorLog.ts`의 실제 TypeScript 타입과 `exportMarketEpisode()` 반환 타입을 컴파일러 API로 읽는다. 별도 복제 스키마를 유지하지 않는다. 타입 외에도 UUID, 이벤트 순서와 시간, synthetic provenance, 입력 trace의 상태머신 재생을 확인한다. 서버 이벤트 매핑은 프런트엔드와 공유한다.

정책은 공개 observation과 자체 기억만 사용한다. 이동은 32px 이내이고 이동 경로·충돌은 상태머신 및 재생 검증의 대상이다. 가상 시간은 이동 거리/속도와 행동별 판단 지연을 반영하므로 실제 벽시계 대기로 처리 속도를 낮추지 않는다. 게임의 시간제한을 새로 만들지 않고 실행 제한은 정상 포기로 마감한다.

## LLM 모드와 재생

`mode:"llm"`은 모델 요청을 명시적으로 켠다. 제공자의 OpenAI 호환 Chat Completions endpoint를 `llm.baseUrl`, 모델명을 `llm.model`, API 키가 담긴 환경변수 **이름**을 `llm.apiKeyEnv`로 전달한다. 설정값을 생략하면 `MARKET_LLM_BASE_URL`, `MARKET_LLM_MODEL`, `MARKET_LLM_API_KEY`를 읽는다. 기본 모델 호출 상한은 500회, 요청 제한시간은 45초이며 `llm.maxCalls`와 `llm.timeoutMs`로 조정한다. 키 값을 파일·옵션·로그에 넣지 않는다. 예시는 endpoint와 모델명을 사용 중인 제공자의 값으로 바꾼다.

```json
{
  "personaId": "careful-checker",
  "seed": "llm-sample-1",
  "mode": "llm",
  "maxActions": 1500,
  "llm": {
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "your-model-id",
    "apiKeyEnv": "MARKET_MODEL_KEY"
  },
  "outputPath": "/tmp/market-llm.jsonl"
}
```

다음 행동과 지연시간을 모델이 결정하며, 응답도 동일 어댑터 가드를 통과한다. 매 이동까지 호출하므로 확률 정책보다 느리고 유료 endpoint에서는 비용이 발생한다. 요청·응답은 재생을 위해 trace에 저장된다. 동일 seed로 새로 호출한 모델 출력은 같다고 보장하지 않으며, 새 LLM 실행마다 새로운 세션 UUID를 부여한다. 생성 API의 `replayTrace`에 저장된 trace를, `sessionId`에 원본 `episode.sessionId`를 제공하고 원본 설정과 실행 제한을 유지하면 모델을 호출하지 않고 재생한다. 출처·모드·시각이 달라진 trace는 거절한다. `validateEpisodeReplay(result)`는 저장된 결과 전체를 오프라인으로 재생·검증한다.

실제 모델 연결은 [Chat Completions 계약](https://developers.openai.com/api/reference/resources/chat)에 맞는 JSON 응답을 사용한다. 제공 모델은 JSON object 출력과 `max_completion_tokens`를 지원해야 한다.

## MCP와 스킬

STDIO MCP 서버 실행 명령:

```sh
node /absolute/path/to/Oneuldo/market-simulator/server.cjs
```

MCP 클라이언트에 이 명령을 등록하면 `list_personas`, `generate_episode`, `generate_batch`, `validate_episode_schema`, `export_to_backend`를 사용할 수 있다. JSON-RPC를 stdout으로, 오류를 응답에 출력하며 브라우저 bridge, ControlLease 또는 단일 세션 잠금이 없다. 생성 도구는 큰 로그 전체 대신 JSONL 경로와 요약을 반환한다. 여러 도구 요청을 함께 처리하고 대량 생성은 별도 워커로 병렬 실행한다.

Codex용 [SKILL.md](../market-persona-skill/SKILL.md)는 페르소나 선택, seed 변화, 재현·비교와 명시적 export 흐름을 정의한다. 전역 스킬/MCP 설정은 변경하지 않는다.

## 격리된 백엔드로 명시적 전송

생성은 파일 저장이 기본이다. 운영 환경 export는 구현하지 않는다. `local` 또는 `staging`이라는 이름만으로 전송을 허용하지 않고, 별도 설정 파일에서 `isolated:true`를 선언한 대상만 허용한다. 이 선언은 운영자의 격리 확인이며, 프로그램이 서버의 실제 DB 연결을 원격으로 증명하는 기능은 아니다. 반드시 전용 DB/스키마와 테스트 사용자를 사용한다.

예를 들어 `/tmp/market-targets.json`:

```json
{
  "local": {
    "baseUrl": "http://127.0.0.1:18080",
    "isolated": true,
    "tokenEnv": "MARKET_SIM_LOCAL_TOKEN"
  },
  "staging": {
    "baseUrl": "https://dedicated-synthetic-staging.example.com",
    "isolated": true,
    "tokenEnv": "MARKET_SIM_STAGING_TOKEN"
  }
}
```

```sh
MARKET_SIM_TARGETS=/tmp/market-targets.json node market-simulator/cli.cjs export '{"batchFilePath":"/tmp/market-batch.jsonl","targetEnv":"local"}'
```

토큰은 별도 환경변수로 준비한다. 로컬 대상은 loopback 주소만, staging은 HTTPS만 허용한다. redirect는 허용하지 않는다. 모든 행의 구조·provenance·재생을 전송 전에 검증하고, `POST /api/behavior-logs/batches`에 `{batchId,events}`를 50건씩 보낸다. 재시도와 파일 재전송은 동일 배치·이벤트 ID를 사용한다. HTTP 200, 정확한 batch ID/이벤트 ID/순서와 `ACCEPTED` 또는 `DUPLICATE` 응답을 확인한다. 무한 재시도하지 않는다.

에피소드의 `config.provenance` 및 각 로그의 `payload.marketContent.provenance`에 `source:"synthetic"`, 정책/모델 식별자, 페르소나 ID·버전을 보존한다. 태그는 테스트 DB 격리를 대체하지 않는다.

## 검증

```sh
npm --prefix market-simulator test
npm --prefix market-simulator run typecheck
npm --prefix market-simulator run verify
npm --prefix market-simulator run verify:persona
```

계약·이동/재생·seed 변화·페르소나 비교·STDIO·export 재시도 테스트를 실행한다. `verify`는 같은 매장에서 프로필당 30건을 병렬 생성하고 전부 검증한 뒤 통계와 HTTP 테스트용 `http-smoke.json`을 저장한다. 기존 백엔드에는 synthetic 제외 필터가 없으므로 반드시 전용 DB를 사용한다. 실제 Spring HTTP 수락 결과와 재실행 명령은 [검증 보고서](../docs/market-simulator-validation.md)에 있다.

`verify:persona`는 같은 environmentSeed에서 mild v2의 행동 seed를 바꾸어 로컬 JSONL과 표본 보고서를 생성한다. 이동·시간을 제외한 행동 차이, 관찰 정보와 이유, 수정·도움·성공 및 반복 후보를 점검한다. 이 실행은 백엔드나 외부 LLM을 호출하지 않는다. 표본 검사 결과와 게임에서 표현할 수 없어 검증하지 못한 항목을 구분해 보고한다.
