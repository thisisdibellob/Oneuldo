# 오늘도 로컬 Ollama 연결

> 아래는 초기 SSH 터널 방식의 설정 기록이다. 현재 팀원용 HTTPS 서버 연결은 [팀원 연결 안내](team-server-connection.md)를 따른다.

현재 구성: 앱 → 오늘도 백엔드(맥) → SSH 터널 → Ubuntu 노트북의 Ollama.
노트북은 i7-13650HX / RAM 24GB / RTX 4060 Mobile 8GB이며 모델은
`qwen3.6:27b-q4_K_M`이다. 백엔드 자체를 노트북으로 옮기는 배포는 별도 단계다.

## 1. 맥에서 SSH 터널 유지

서버에 접속해 있는 `bluem@jh-server` 셸이 아니라 **새 맥 터미널**에서 실행한다.

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:11435:127.0.0.1:11434 bluem@192.168.219.100
```

연결 성공 시 프롬프트 없이 대기한다. 이 창을 유지한다.
다른 맥 터미널에서 확인한다.

```sh
curl --connect-timeout 3 http://127.0.0.1:11435/api/tags
```

Ollama 11434 포트를 인터넷에 공개할 필요가 없다. 노트북이나 맥을 재부팅하거나
SSH 연결이 끊어지면 터널을 다시 실행한다.

## 2. 백엔드 실행

기존 백엔드를 종료하고 기존 DB/JWT 설정을 유지한 채 `backend` 폴더에서 실행한다.
Java 25가 필요하다.

```sh
./gradlew bootRun --args='--spring.profiles.active=ollama'
```

이미 다른 Spring 프로필을 쓰고 있다면 `local,ollama`처럼 기존 프로필에 추가한다.
활성 프로필 로그에 `ollama`가 있어야 한다. `local.properties`의 Groq 키가 있어도
Ollama 프로필에서는 Groq 클라이언트를 등록하지 않으며 실패 시 Groq로 전송하지 않는다.
기존 앱의 온디바이스 대체 동작은 그대로다.

백엔드를 나중에 노트북으로 옮기면 터널 대신 다음 환경변수를 사용한다.

```sh
OLLAMA_BASE_URL=http://127.0.0.1:11434 ./gradlew bootRun --args='--spring.profiles.active=ollama'
```

## 3. 앱 응답 대기 시간

`frontend/.env.local`에 아래 항목을 추가하고 Expo 개발 서버를 재시작한다.
`EXPO_PUBLIC_API_URL`은 계속 오늘도 백엔드 주소를 사용한다. Ollama 주소로 바꾸지 않는다.

```dotenv
EXPO_PUBLIC_AI_TIMEOUT_MS=1800000
```

이 설정은 퀘스트 문장 생성의 HTTP 제한을 30분으로 늘린다. 미설정 시 기존 25초다.
긴 분석은 기존 분석 작업 생성/상태 조회 흐름을 사용한다.
긴 제한은 작업을 기다릴 수 있게 할 뿐 처리 속도를 높이지 않는다.
배포 시 중간 프록시의 HTTP 제한도 확인해야 한다.

## 호출 및 메모리 설정

- Ollama native `/api/chat`, `think=false`, `stream=false`, `keep_alive=10m`.
- 컨텍스트 8192, 분석 요청 예산은 입력+출력 7000, 관찰 구간 출력은 900, 최종 분석 출력은 1800 토큰.
  실제 API 검사에서 최종 JSON이 900 토큰에 두 번 잘려 Ollama 프로필만 상향했다.
  `OLLAMA_FINAL_OUTPUT_TOKENS`로 조정할 수 있으며 전체 요청 예산 안에서 출력 공간을 예약한다.
- 서버 호출 직전 전체 입력+출력을 검사하며 컨텍스트에 추가로 256 토큰 여유를 둔다.
  기존 Qwen 토크나이저를 사용하므로 임의 모델로 교체하는 것은 지원하지 않는다.
- 백엔드 인스턴스당 실행 1개, 대기 최대 8개. 대기 제한 10분, HTTP 응답 제한 15분.
  큐 초과/시간 초과는 오류로 반환한다. 재시도나 클라우드 전환은 하지 않는다.
- 노트북의 `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`도 유지한다.
  백엔드 여러 인스턴스나 직접 curl 호출의 대기열은 이 클라이언트 큐와 별개다.
- 분석/퀘스트 재사용 키에는 Ollama 구분, 모델 리비전, 컨텍스트 및 옵션이 들어간다.
  같은 태그의 모델을 교체하면 `/api/tags`의 새 digest를 `OLLAMA_MODEL_REVISION`으로 지정해
  백엔드를 다시 시작한다. digest는 서버에서 자동 확인하지 않는다.

## 확인된 성능과 검증 범위

사용자가 제공한 짧은 합성 요청: 입력 101 / 출력 169 토큰, 총 39.74초,
생성 속도 약 4.44 토큰/초. CPU/GPU 분할은 65%/35%이며 8K 설정에서
RAM available 약 10GiB였다. 모델 정보의 262144 컨텍스트는 실제 실행 설정이 아니다.
현재 실제 실행은 8192다.

이 결과만으로 오늘도 전체 분석의 품질, 긴 입력의 메모리 사용량, 3인 동시 사용 지연을
검증했다고 볼 수 없다. 실제 앱에서는 인증된 테스트 계정의 합성 데이터로
분석 완료 여부/총 시간/출력 잘림/근거 연결을 확인해야 한다.

단위 테스트는 요청 형식, 응답 및 길이 종료 전달, 입력 한도, 큐 제한과 해제,
프로필별 클라이언트 선택, 프론트엔드 시간 제한을 검증한다.

2026-09-10 검증: 새 `RestOllamaChatClient`로 SSH 터널을 통해 합성 문장을 전송했다.
입력 62 / 출력 21 토큰, 클라이언트 측 대기 포함 26,387ms, 종료 사유 `stop`으로 성공했다.
응답은 “사용자는 장보기 목록에서 우유 수량을 2개에서 1개로 수정했다.”였다.
이는 클라이언트와 실제 모델 간 연결 검증이며 앱/DB를 포함한 전체 분석 검증은 아니다.

- 백엔드 전체 테스트: 143개 중 132개 성공, 10개 건너뜀, 1개 실패.
  실패는 미수정 마이그레이션 V37의 `timestamptz`를 H2가 지원하지 않아 발생한
  `QuestMigrationTest`이며 Ollama 호출과 무관하다.
- 이후 별도 실행한 실제 Ollama 연결 테스트 1개 성공.
- 프론트엔드 관련 테스트 6개 및 TypeScript 검사 성공.

실제 연결 테스트 재실행 (`backend` 폴더, 터널 필요):

```sh
OLLAMA_LIVE_SMOKE=true ./gradlew test --tests 'oneuldo.ai.client.OllamaLiveSmokeTest'
```

## 실제 HTTP 분석 작업 재검증 (2026-09-10)

합성 테스트 계정으로 가입/로그인 → 장보기 기록 5건 저장 → 분석 작업 생성/조회까지 실행했다.
첫 실행은 900토큰 출력 잘림으로 2회 모두 실패했다. Ollama 프로필의 최종 출력 한도를
1800으로 변경하고 백엔드를 재시작한 뒤, 같은 내용의 새 합성 세션은 285,557ms에
`READY`로 완료됐다. AI 호출 1회, 입력 3688 / 출력 1059토큰, 종료 이유 `stop`이었다.
앱 UI와 다중 사용자 부하는 별도 검증 대상이다. 상세 결과는
`output/ollama-api-check/result.md` 및 `retest.json`에 기록했다.
