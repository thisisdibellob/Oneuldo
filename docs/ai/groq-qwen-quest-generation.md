# Groq Qwen 퀘스트 생성 연동 설계

## 1. 목적

온디바이스 `Bllossom Llama 3.2 Korean 3B Q4`는 오프라인 동작과 개인정보 보호에는 유리하지만, 현재 실기기에서 4단계 생성에 수 분이 걸리고 비문이 안전 검증을 통과하는 사례가 있다. 인터넷과 로그인 토큰이 있을 때는 Groq의 `qwen/qwen3.6-27b`를 우선 사용해 생성 속도와 한국어 문장 품질을 높이고, 외부 서비스 장애 시 기존 온디바이스 경로를 유지한다.

Qwen 3.6 27B는 Groq에서 Preview로 제공되며 비추론 모드(`reasoning_effort: none`)와 약 500 tokens/s 추론을 지원한다. 모델은 환경변수로 교체할 수 있게 고정값을 코드에 박지 않는다.

- Groq 모델 문서: https://console.groq.com/docs/model/qwen/qwen3.6-27b
- Chat Completions API: https://console.groq.com/docs/api-reference
- 무료 플랜 한도: https://console.groq.com/docs/rate-limits

## 2. 선택한 구조

```text
로그인 앱
  │  POST /api/ai/quest-step/generate
  │  questId, stepId, theme, requestId, retryFailureCode만 전송
  ▼
Spring 백엔드
  ├─ JWT 인증
  ├─ DB에서 퀘스트·단계 원문 재조회
  ├─ 허용된 카테고리·테마인지 검증
  ├─ 서버에서 프롬프트 생성
  └─ GROQ_API_KEY로 Groq Chat Completions 호출
       │
       ▼
  qwen/qwen3.6-27b
       │ 상황 1줄 + 선택지 N줄
       ▼
앱 안전 검증 및 원본 구조 병합
```

API 키를 React Native 앱에 넣지 않는다. APK와 네트워크 요청에서 키가 노출될 수 있기 때문이다. 키는 백엔드 환경변수에만 저장하며 앱은 오늘도 서버에만 요청한다.

앱이 임의의 프롬프트를 백엔드에 보내는 구조도 사용하지 않는다. 로그인 사용자가 오늘도 API를 범용 무료 LLM 프록시로 악용할 수 있기 때문이다. 앱은 식별자와 승인된 테마만 보내고, 백엔드가 DB 원본으로 프롬프트를 다시 만든다. 따라서 클라이언트가 정답 여부, 선택지 또는 시스템 지시를 변조해 Groq에 전달할 수 없다.

## 3. 요청과 응답

### 요청

```http
POST /api/ai/quest-step/generate
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "questId": "30000000-0000-0000-0000-000000000005",
  "stepId": "40000000-0000-0000-0000-000000000101",
  "requestId": "quest-warmup-...-1",
  "theme": "비가 살짝 오는 날",
  "retryFailureCode": null
}
```

### 응답

```json
{
  "requestId": "quest-warmup-...-1",
  "text": "비가 살짝 오는 날, 정류장에 버스가 도착했어요.\n버스 번호를 확인한다.\n확인하지 않고 바로 탄다.",
  "model": "qwen/qwen3.6-27b",
  "latencyMs": 420
}
```

Groq에는 일반 텍스트 출력을 요청한다. 현재 온디바이스 경로와 동일하게 첫 줄은 상황, 이후 줄은 원래 순서의 선택지다. JSON 출력 구조를 모델에 요구하지 않으며 ID, 지시문, 힌트, 정답 여부와 피드백은 서버 원본에서 앱이 복원한다.

## 4. 실행 및 fallback 순서

```text
Groq 호출 성공
  → 앱 파싱·안전 검증
  → 실패하면 Groq에 1회 재시도

Groq 호출 자체 실패(429, 503, timeout, network)
  → 같은 요청을 온디바이스 모델로 실행
  → 앱 파싱·안전 검증

클라우드와 온디바이스 생성 모두 실패
  → 해당 단계 원문 사용
  → 뒤 단계 생성 중단
  → 퀘스트 전체를 원문으로 복구
```

서버는 Groq의 429를 `CLOUD_AI_RATE_LIMITED`로, 비활성화·시간초과·외부 장애를 `CLOUD_AI_UNAVAILABLE`로 반환한다. 앱은 외부 장애 종류와 관계없이 즉시 온디바이스 경로로 전환한다. 분당 한도를 기다리느라 퀘스트 화면을 오래 막지 않기 위한 선택이다.

## 5. Groq 요청 설정

| 설정 | 값 | 이유 |
|---|---:|---|
| model | `qwen/qwen3.6-27b` | 현재 3B 모델보다 큰 다국어 모델 |
| reasoning_effort | `none` | 짧은 문장 변형에 추론 토큰이 필요하지 않음 |
| reasoning_format | `hidden` | 사고 과정이 화면 텍스트에 섞이지 않게 함 |
| temperature | `0.7` | 원문 복사를 줄이면서 과도한 무작위성을 제한 |
| top_p | `0.8` | Qwen 비추론 모드 권장값 |
| max_completion_tokens | `256` | 상황과 선택지만 생성하므로 충분함 |
| 서버 timeout | 기본 20초 | 지연 시 온디바이스 fallback으로 전환 |
| 앱 timeout | 25초 | 서버 timeout과 오류 응답 전달 시간을 포함 |

## 6. 환경 설정

백엔드 실행 환경에 다음 값을 넣는다. 실제 키는 저장소에 커밋하지 않는다.

```properties
GROQ_ENABLED=true
GROQ_API_KEY=<Groq Console에서 발급한 키>
GROQ_MODEL=qwen/qwen3.6-27b
GROQ_TIMEOUT=PT20S
```

선택 설정:

```properties
GROQ_BASE_URL=https://api.groq.com
```

`GROQ_ENABLED=false`이거나 키가 비어 있으면 백엔드는 503을 반환하고 앱은 온디바이스 모델을 사용한다. 개발·테스트 환경은 기본적으로 외부 API를 호출하지 않는다.

## 7. 한도와 운영 주의사항

현재 Qwen 무료 플랜 한도는 조직 기준 분당 30요청, 하루 1,000요청, 분당 8,000토큰, 하루 200,000토큰이다. 한 퀘스트가 4단계면 재시도 없이 4요청, 모든 단계가 재시도하면 최대 8요청을 사용한다. 한도를 넘으면 자동 결제되지 않고 Groq가 429를 반환한다.

Qwen 3.6 27B는 Preview이므로 모델 종료에 대비해 `GROQ_MODEL` 환경변수만 바꿔 교체할 수 있게 한다. 다른 모델로 변경할 때는 `reasoning_effort` 지원 여부와 출력 품질 회귀 테스트가 필요하다.

로그에는 API 키, 전체 프롬프트, 아동 관련 자유 입력을 남기지 않는다. 개발 로그에는 요청 ID, 모델명, 지연 시간, cloud/device fallback 여부만 기록한다.

## 8. 변경된 코드 영역

- 백엔드 `oneuldo.ai`: 인증된 생성 API, DB 기반 프롬프트, Groq REST 클라이언트
- 프론트엔드 `cloudQuestGeneration.ts`: 오늘도 백엔드 호출과 응답 검증
- 프론트엔드 `cloudFirstQuestRuntime.ts`: cloud → device 전환
- `questStepGenerator.ts`: 로컬 프롬프트와 클라우드 식별자를 함께 전달
- `questGenerationStore.ts`: 로그인 토큰이 있으면 클라우드 우선 런타임 선택

## 9. 검증 범위

- 백엔드 프롬프트에 ID·힌트가 포함되지 않는지 검사
- 허용되지 않은 테마와 다른 퀘스트의 stepId 차단
- Groq 성공 응답 전달 검사
- Groq 실패 시 온디바이스 초기화 및 생성 검사
- 기존 출력 파싱, 안전 검증, 1회 재시도, 단계 조기 중단 회귀 테스트
- 실제 Groq 호출은 `GROQ_API_KEY`를 주입한 로컬/스테이징 환경에서 별도로 확인

## 10. 한국 버스·지하철 규칙 매핑

한국 대중교통 사실은 `backend/src/main/resources/ai/korean-public-transport-rules.json`에서 버전과 함께 관리한다. 파일에는 공통 규칙, 버스·지하철 판별 키워드, 교통수단별 규칙과 생성 금지 사실이 있다.

백엔드는 DB 원문의 코드·제목·목표·단계 문장을 검사해 `BUS` 또는 `SUBWAY`를 선택하고 해당 규칙만 Groq 프롬프트에 넣는다. 온디바이스 fallback도 같은 버전의 축약 규칙을 `frontend/src/ai/prompts/koreanTransportRules.ts`에서 적용한다. 규칙에 없는 요금·시간·노선 번호·법률·설비는 모델이 추측하지 못하게 지시한다.

앱의 최종 안전 검증은 프롬프트 준수 여부와 별개로 다음 대표 오류를 거절한다.

- 버스 원문에 없는 안전벨트 의무 추가
- 목적지 도착 후 하차 버튼을 누른다는 순서
- 버스 퀘스트에 개찰구·승강장 등 지하철 설비 추가
- 지하철 퀘스트에 하차 버튼·버스 번호·기사님 추가
- `승차권 찍는 기계` 같은 부정확한 용어 추가

`V12__insert_subway_scenario_quest_data.sql`은 EASY `혼자 지하철 타기`와 NORMAL `지하철 갈아타기`를 기존 `PUBLIC_TRANSPORT` 세부 카테고리에 추가한다. 화면 탭이나 카테고리는 새로 만들지 않으며, 기존 대중교통 카드가 버스·지하철 원본 시나리오를 함께 순환한다.
