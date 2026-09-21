# 팀원 AI 서버 연결

기본 학교 서버 주소는 `https://oneuldo.duckdns.org`이다. 팀원 백엔드가 HTTPS와 Bearer API 키로 Spring AI 게이트웨이에 요청한다. 게이트웨이는 서버 내부 Ollama에 요청하며, 팀원에게 SSH나 VPN은 필요하지 않다. 모델은 `qwen3.6:27b-q4_K_M`, 학교 클라이언트 기본 컨텍스트는 18,432, 요청 예산은 18,000이다. 노트북 선택 시에는 8,192 / 7,800을 명시한다.

## 최초 설정

1. 게이트웨이 연동 코드가 포함된 브랜치의 최신 프로젝트를 받는다.
2. 학교 서버 관리자에게 본인 전용 API 키를 전달받는다. 기존 노트북 키는 학교 서버에서 사용할 수 없다. SSH 키 암호, 서버 비밀번호, DDNS 키와 다른 값이다.
3. 프로젝트 루트에서 Python 3으로 실행한다.

```bash
python3 backend/scripts/configure-home-ai.py
```

키를 붙여넣고 Enter를 누른다. 입력 내용은 표시되지 않는다. 스크립트는 HTTPS 인증과 모델 목록을 확인한 뒤 `backend/local.properties`의 AI 설정만 갱신한다. 기존 DB 설정 등은 유지한다. 이 파일은 Git에서 제외되고 소유자만 읽고 쓸 수 있다.

4. 프로젝트에서 사용하는 Java 25와 기존 DB 설정을 준비한 상태에서 실행한다.

```bash
bash backend/scripts/run-home-ai.sh
```

Windows에서는 `gradlew.bat`를 사용한다. IDE 실행 시 Active profiles에 `ollama`를 지정하고, 프로그램 인수에 `--spring.config.additional-location=optional:file:./local.properties,optional:file:./backend/local.properties`를 추가한다. 로컬 파일이 프로필 기본값보다 우선하도록 하기 위한 설정이다. 실행 스크립트에는 이 설정이 포함돼 있다. 다른 프로필이 필요한 환경이라면 기존 프로필에 `ollama`를 추가한다. 실행 중이던 백엔드는 재시작해야 변경된 설정이 적용된다.

수동 설정을 원하면 `backend/local.properties`에 아래 항목을 설정한다. 기존 `local.properties`의 8K 값이 새 기본값보다 우선하므로 기존 사용자도 함께 갱신한다.

```properties
ai.ollama.base-url=https://oneuldo.duckdns.org
ai.ollama.api-key=본인에게_발급된_API_키
ai.ollama.timeout=PT30M
ai.ollama.context-length=18432
ai.behavior-analysis.request-token-budget=18000
ai.behavior-analysis.chunk-output-tokens=1800
ai.behavior-analysis.final-output-tokens=1800
ai.behavior-analysis.quality-review=true
```

환경변수 방식은 `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, `OLLAMA_TIMEOUT`을 사용한다. 로컬 파일에 같은 항목을 중복 설정하지 않는다. 키를 프런트엔드, `EXPO_PUBLIC_*`, Git, 채팅 로그에 넣지 않는다. 프런트엔드는 기존처럼 본인의 프로젝트 백엔드에 연결한다. 로컬 모델로 동기식 퀘스트 생성도 사용할 경우 `frontend/.env.local`에 `EXPO_PUBLIC_AI_TIMEOUT_MS=1800000`을 설정하고 Expo를 재시작한다. 이 값은 대기 시간이며 비밀키가 아니다.

## 서버 관리자: 팀원 추가

학교 서버(`duream@117.16.44.110`) SSH 터미널에서 팀원마다 다른 이름으로 실행한다.

```bash
sudo /opt/oneuldo-ai/add-key.sh member2
sudo systemctl restart oneuldo-ai
sudo cat /etc/oneuldo-ai/issued/member2.key
```

마지막 출력은 해당 팀원에게 개인적으로 전달한다. 학교 서버에는 관리자용 `admin-mac` 키가 발급되어 있다. 팀원 키는 별도로 발급하며, 기존 이름과 겹치지 않게 한다. 관리자 키를 공용으로 배포하지 않는다. 재시작은 진행 중인 요청에 영향을 줄 수 있으므로 사용 중인 요청이 없을 때 한다. 키 해시는 시작 시 읽으므로 추가 후 재시작해야 한다.

## 사용 및 확인

연결 실패 시 먼저 프로젝트 루트에서 공개 연결을 진단한다. 키 입력 없이 DNS/TCP/TLS/HTTP 실패 단계, 소요 시간, 무인증 차단 상태를 출력한다. 설정 파일은 읽거나 변경하지 않으며 추론도 실행하지 않는다.

```bash
python3 backend/scripts/check-ai-connection.py --attempts 3
```

`GATEWAY_UP`과 `AUTH_REQUIRED_EXPECTED`가 정상 결과다. `/api/tags`에 키 없이 요청한 401은 정상이며, 본인 키 인증 성공을 뜻하지 않는다. `TCP_CONNECT_TIMEOUT`은 DNS 조회 이후 TCP 연결 단계 실패이므로 키 재발급이나 모델 응답 토큰 증가로 해결되지 않는다. 다른 네트워크(예: 휴대폰 데이터)에서 같은 검사와 비교한다. `TLS_FAILED`에서는 인증서 검증을 끄지 않는다. 출력은 관리자에게 전달할 수 있으며 개인 키는 포함되지 않는다.

이전의 `configure-home-ai.py`는 연결 실패를 한 문장으로 안내했다. 이제 DNS, TLS, 시간 초과, 연결 거절, API 인증 실패, 서버 5xx를 구분하고 진단 명령을 안내한다. 실패한 설정 시도는 기존 `local.properties`를 유지한다.

- `https://oneuldo.duckdns.org/healthz`에서 `{"status":"up"}`이면 게이트웨이에 연결된 상태다. 실제 모델 응답까지 보장하는 검사는 아니다.
- 401: 키 누락 또는 잘못된 키. 설정 스크립트로 다시 확인한다.
- 429: 같은 키로 요청이 진행 중이거나 서버 대기열이 가득 찼다. 기존 요청을 기다린 후 다시 시도한다.
- 서버는 AI 요청을 한 번에 하나 처리한다. 여러 팀원은 대기하며, 긴 분석에는 수 분 걸릴 수 있다.
- 서버 전원과 인터넷 연결이 필요하다. 관리자 맥북이나 SSH 터널은 AI 서비스 운영에 필요하지 않다.
- 학교 서버 공개 HTTPS는 맥과 휴대폰 데이터망에서 확인했다. 다만 맥에서 간헐적인 TCP 연결 시간 초과도 관찰되어 네트워크 안정성은 추가 확인이 필요하다. 연결 실패가 반드시 키 오류를 뜻하지는 않는다.

관리 로그는 서버에서 `sudo journalctl -u oneuldo-ai -f`로 확인한다. HTTPS 문제는 `sudo journalctl -u oneuldo-https -n 40 --no-pager`로 확인한다.

## 기존 노트북으로 수동 전환

학교 서버가 기본이며 자동으로 노트북에 재요청하지 않는다. 기존 노트북 서비스와 키는 보존했다. 노트북 사용이 필요하면 아래 명령에 **노트북에서 발급한 키**를 입력하고 백엔드를 재시작한다.

```bash
python3 backend/scripts/configure-home-ai.py --server laptop
```

학교 서버로 돌아오려면 `--server school`로 실행한다. 학교와 노트북의 키는 서로 대체할 수 없다. 노트북 주소는 `https://bluem.myvnc.com`이며 해당 No-IP 호스트의 정기 확인은 계속 필요하다. 스크립트 파일명의 `home`은 기존 명령과의 호환을 위해 유지한다.

## 응답 한도와 긴 요청 (2026-09-13)

학교 Ollama 프로필의 기본 요청 예산은 입력·출력을 합쳐 18,000토큰이다. 구간 관찰/통합 응답과 최종 응답은 각각 최대 1,800토큰이며, 컨텍스트는 18,432토큰이다. 게이트웨이의 추가 메시지 여유분 32토큰을 포함해도 18,176토큰 방어 한도 안에 들어간다. 노트북 설정은 컨텍스트 8,192 / 요청 예산 7,800을 사용한다. 입력이 커지면 원본 사건을 유지한 채 구간을 나눈다. 최대 출력은 예약 한도이며 항상 그만큼 생성하는 것은 아니다.

`run-home-ai.sh`는 macOS에서 실행 중인 동안 `caffeinate -i`로 유휴 절전을 방지한다. 수동 잠자기나 덮개 닫힘까지 방지하는 기능은 아니므로 긴 테스트에서는 맥북 덮개를 열어둔다. 백엔드를 종료하면 절전 방지 요청도 해제되며 시스템 설정은 바꾸지 않는다.


### 기존 노트북의 전체 원본 단일 호출 실험 (2026-09-13)

동일한 187개 사건에서 8,192 문맥의 7회 호출(23분 14초)을 18,432 문맥의 1회 호출(7분 8초)로 줄였다. 출력 상한은 1,800이며, 사건·좌표를 버리거나 서버가 성패를 판정하지 않는다. 구조·참조 검증 통과와 분석 내용의 정확성은 별개다. 결과와 한계는 `output/whole-play-analysis-2026-09-13/result.md` 참고. 단일 실행 결과이며 동시 사용자 성능은 측정하지 않았다.

공개 게이트웨이를 새 빌드로 교체한 뒤에만 큰 문맥을 사용한다. 게이트웨이는 `num_ctx` 8192 또는 18432만 허용하고 각각 문맥-256 한도를 검사한다. 게이트웨이에서 `num_ctx`를 생략했을 때는 8192이며, 현재 학교 클라이언트는 18432를 명시해서 보낸다. 인증·단일 추론 대기열·1,800 출력 상한은 유지된다.

아래는 기존 노트북의 과거 업데이트 명령이다. 학교 서버에는 해당 기능이 이미 설치되어 있으므로 실행할 필요가 없다(기존 JAR 백업, 실패 시 복원):

```bash
sudo bash ~/oneuldo-context-release/update-context.sh
```

이후 프로젝트의 백엔드를 다음 설정으로 재시작한다.

```bash
OLLAMA_CONTEXT_LENGTH=18432 OLLAMA_REQUEST_TOKEN_BUDGET=18000 bash backend/scripts/run-home-ai.sh
```

현재 학교 기본값은 18K다. 기존 8K 설정으로 돌아가려면 `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_REQUEST_TOKEN_BUDGET=7800`을 함께 지정한다. `local.properties`에 같은 설정이 있다면 그 값도 8192 및 7800으로 변경한다. 여러 클라이언트가 서로 다른 문맥을 번갈아 요청하면 모델 재로딩 비용이 생길 수 있다.


## 연결 오류와 AI 검토 (2026-09-17)

Ollama 프로필은 연결 수립 제한을 15초로 두고, 연결 수립 실패에만 최대 2회 재시도한다(최대 3회 시도, 1초·2초 간격). 이미 추론이 시작됐을 수 있는 응답 대기 시간 초과·연결 끊김·HTTP 429/5xx는 자동 재전송하지 않는다. 여러 번 클릭하는 대신 작업 상태를 확인하고, 실패한 분석은 같은 스냅샷으로 재개하면 완료한 단계의 체크포인트를 재사용한다.

- `AI_CONNECT_TIMEOUT` / `AI_CONNECT_FAILED`: 연결 수립 시간 초과 / 연결 실패.
- `AI_DNS_FAILED` / `AI_TLS_FAILED`: 이름 해석 / TLS 연결 문제.
- `AI_RESPONSE_TIMEOUT`: 연결 후 응답 시간 초과. 서버에서 추론 중일 수 있으므로 즉시 반복 요청하지 않는다.
- `AI_AUTH_FAILED`: API 키 인증 문제. `AI_RATE_LIMITED`: 게이트웨이 요청 제한.
- `AI_SERVER_ERROR`: 게이트웨이 5xx. `AI_QUEUE_FULL` / `AI_QUEUE_TIMEOUT`: 클라이언트 대기열 문제.

백엔드 로그의 `AI transport` 항목에는 요청 ID, 시도 횟수, 소요 시간, 실패 코드가 남는다. 실패한 분석의 감사 기록에도 연결/응답 단계와 HTTP 상태를 보관한다. 키와 응답 본문은 연결 오류 로그에 기록하지 않는다. 연결 재시도는 간헐적 장애의 영향을 줄이는 조치이며 학교 네트워크 자체의 원인을 해결했다는 뜻은 아니다.

연결 옵션은 `OLLAMA_CONNECT_TIMEOUT=PT15S`, `OLLAMA_CONNECT_RETRIES=2`, `OLLAMA_CONNECT_RETRY_DELAY=PT1S`로 조정한다. 기존 응답 대기 제한(`OLLAMA_TIMEOUT`)과는 별개다.

Ollama 분석에는 원본과 분석 초안을 대조하는 AI 검토 1단계가 추가된다. 구간 요약의 범위, 기록과 추측, 과거 세션 종료 의미, 지원 문장과 실행 설정의 일관성을 AI가 확인한다. 검토 응답의 `reviewNotes`에는 수정 근거 요약을, `analysis`에는 최종 분석을 받아 원본 응답을 감사 기록에 보관한다. 가상 게임의 목표 수행과 실제 결제 승인을 구분하는 기능 설명도 제공한다. 퀘스트 생성에는 미확인을 능력 부족으로 바꾸지 않고 관찰과 연습 목표의 연결만 설명하도록 지시한다. 서버가 성공/실패를 계산하거나 분석 문장을 규칙으로 수정하지 않는다. 이 단계도 동일한 토큰 예산, 출력 상한, 구조·근거 검증과 체크포인트를 적용한다. 추가 모델 호출만큼 시간이 늘 수 있다. `OLLAMA_QUALITY_REVIEW=false`는 이 추가 단계를 끄는 비교 실험용 설정이다.

이 변경은 **프로젝트 백엔드** 코드이므로 팀원은 변경 코드를 받고 백엔드를 재시작해야 한다. 학교 게이트웨이의 키·GPU 선택·방화벽을 바꿀 필요는 없다. 프런트엔드도 갱신하면 검토 중 안내와 새 세션 종료 기록이 적용된다.


## 2026-09-21 팀원 장애 대응 변경

- 학교 기본값과 설정 스크립트를 18,432 / 18,000으로 통일했다. 설정 스크립트는 과거 로컬 파일의 8K 값이나 축소된 출력 상한도 갱신한다. `--server laptop`은 노트북 주소·키·8K 예산을 선택한다.
- 시작 로그의 `Ollama analysis settings`에서 실제 컨텍스트와 요청 예산을 확인한다. 컨텍스트보다 큰 예산을 섞으면 `OLLAMA_ANALYSIS_BUDGET_MISMATCH`로 시작 단계에 알린다.
- 최종 분석 사전검사는 초안 요청과 현재 검토 템플릿의 요청 크기를 각각 계산하고 큰 값을 사용한다. 초안이 아직 없으므로 초안 출력 상한과 포장 여유를 예약하는 추정치다. 실제 검토 요청도 전송 전에 다시 검사한다. 입력 사건을 삭제하거나 출력 상한·검토를 낮추지 않는다.
- 연결 진단은 요청별 UTC 시작·종료 시각과 연결 주소·포트를 기록한다. `--attempts 5 --direct`로 프록시를 우회한 IPv4 경로를 비교할 수 있다. 인증서 검증은 유지한다. 실패 시 포트 값이 0일 수 있으므로 이것만으로 SYN 송신을 입증하지 않는다.
- 이 변경은 TCP 연결 장애를 해결하는 패치가 아니다. 실패 위치는 동시에 기록한 서버 패킷과 대조해야 한다.
