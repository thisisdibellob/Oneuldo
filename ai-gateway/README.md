# Spring AI gateway

팀원 Spring 백엔드 → Caddy HTTPS → 이 Spring Boot 서버(127.0.0.1:8081) → Ollama(127.0.0.1:11434).
오늘도 DB/로그인 서비스와 독립적이며 FastAPI/Python 프로세스를 사용하지 않는다.
Spring Boot 4.1.0, Java 21. 기존 오늘도 백엔드는 Java 25를 그대로 사용한다.

## 동작

- `Authorization: Bearer <팀원별 키>` 인증. 시작 시 키 해시가 없으면 실행 실패.
- `/api/chat`과 `/api/tags`만 제공. `/healthz`는 인증 없이 게이트웨이 기동 상태만 반환한다.
- 키는 SHA-256 해시로 검증하며 Ollama로 전달하지 않는다. 프롬프트/키를 로그에 쓰지 않는다.
- 전체 실행 1개, 대기 최대 8개, 키별 실행/대기 합계 1개. 같은 키 중복/전체 큐 초과는 429.
- 대기 10분, Ollama 응답 15분. 자동 재시도 및 클라우드 전환 없음. 큐는 재시작 시 보존되지 않는다.
- 모델 Qwen 27B Q4, 문맥 8192, 출력 1~1800, thinking/streaming 비활성. 128KiB 요청 크기 제한.
- 기존 Qwen 토크나이저를 공유하며 출력과 메시지 포맷 여유를 포함해 문맥 초과 입력을 거절한다.
- 임의 모델·이미지·도구 호출은 지원하지 않는다. 서버가 허용한 옵션으로 요청을 재구성한다.
- 반드시 단일 인스턴스로 운영한다. Ollama의 NUM_PARALLEL=1 설정도 유지한다.
- 직접 로컬 Ollama 호출은 이 게이트웨이 대기열을 거치지 않는다. 팀원은 HTTPS 주소로만 연결한다.

## 빌드와 테스트 (맥, 저장소 루트)

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
backend/gradlew -p ai-gateway test bootJar
```

토크나이저는 backend의 소스/리소스에서 빌드 시 포함하며 배포 jar는 단독 실행 가능하다.
테스트는 모의 Ollama HTTP 서버를 사용하고 실제 GPU 추론을 실행하지 않는다.

## 서버 설치

Ubuntu의 `bluem@jh-server`에서:

```sh
sudo apt update
sudo apt install -y openjdk-21-jre-headless
java -version
```

맥에서 준비한 `output/oneuldo-ai-gateway.tar.gz`를 전송한다:

```sh
scp output/oneuldo-ai-gateway.tar.gz bluem@192.168.219.100:~/
```

Ubuntu에서:

```sh
mkdir -p ~/oneuldo-ai-release
tar -xzf ~/oneuldo-ai-gateway.tar.gz -C ~/oneuldo-ai-release
cd ~/oneuldo-ai-release
sudo bash install.sh
sudo /opt/oneuldo-ai/add-key.sh member1
sudo systemctl restart ollama
sudo systemctl start oneuldo-ai
systemctl is-active oneuldo-ai
curl -fsS http://127.0.0.1:8081/healthz
```

member2, member3도 다른 이름으로 키를 만든 뒤 게이트웨이를 재시작한다.
키 파일 `/etc/oneuldo-ai/issued/member1.key`는 root만 읽을 수 있다.
`sudo cat /etc/oneuldo-ai/issued/member1.key`로 본인/해당 팀원에게만 전달한다.
DDNS 키와 AI API 키는 별개다. 프론트엔드의 EXPO_PUBLIC 변수에 AI 키를 넣지 않는다.

키 확인(키를 명령줄 인수/출력에 남기지 않음):

```sh
sudo bash -c 'printf "Authorization: Bearer %s\n" "$(cat /etc/oneuldo-ai/issued/member1.key)" | curl -fsS -H @- http://127.0.0.1:8081/api/tags'
curl -i http://127.0.0.1:8081/api/tags
```

첫 요청은 모델명 반환, 두 번째는 401이어야 한다. 실제 외부 접속은 아직 준비되지 않았다.
기존 `/opt/oneuldo-ai/.venv`가 있어도 사용하지 않으며 설치 스크립트가 삭제하지 않는다.
기동 실패 시 `sudo journalctl -u oneuldo-ai -n 60 --no-pager`로 확인한다.

## HTTPS와 공유기 (로컬 인증 확인 후)

1. DNS `bluem.myvnc.com`이 현재 HGWD-1G WAN 공인 IP를 가리키는지 확인한다.
2. 기존 Caddyfile을 백업하고 제공 파일을 설치한 뒤 검증한다:

```sh
sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-oneuldo
sudo install -m 644 Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

기존 Caddy 사이트가 있으면 전체 덮어쓰기 대신 사이트 블록을 병합한다.
Caddy 설정은 기본 reverse_proxy/request_body 문법을 사용한다. 서버의 2.6.2에서 위 검증을 실행해야 한다.

3. HGWD-1G(192.168.219.1)에서 TCP 외부80→192.168.219.100:80,
   TCP 외부443→192.168.219.100:443만 포워딩한다. DMZ/원격관리/8081/11434 공개는 필요 없다.
4. `sudo ufw status`로 방화벽이 활성 상태인지 확인한다. 활성일 때만 HTTP/HTTPS 허용 규칙을 추가한다.
   SSH 허용을 확인하지 않은 상태에서 방화벽을 새로 켜지 않는다.
5. Caddy가 공인 인증서를 발급하도록 기다린 뒤 집 밖(휴대폰 데이터 등)에서
   `https://bluem.myvnc.com/healthz`와 인증된 `/api/tags`를 확인한다. 내부 접속만으로 외부 연결을 검증했다고 보지 않는다.
   TLS 확인을 끄는 `-k`는 사용하지 않는다.

No-IP 무료 호스트의 30일 유지 확인은 DDNS 자동 IP 갱신과 별도로 해야 한다.
공식 문서: https://caddyserver.com/docs/automatic-https

## 팀원 오늘도 백엔드 설정

`backend/local.properties`(git 제외)에 추가한다:

```properties
ai.ollama.base-url=https://bluem.myvnc.com
ai.ollama.api-key=여기에_해당_팀원의_키
ai.ollama.timeout=PT30M
```

환경변수 OLLAMA_BASE_URL, OLLAMA_API_KEY, OLLAMA_TIMEOUT으로도 설정할 수 있다.
프로젝트 루트에서 `bash backend/scripts/run-home-ai.sh`로 실행한다. 스크립트가 `ollama` 프로필과 로컬 설정 우선순위를 적용한다. SSH 터널은 필요 없다.
키 설정 도우미와 IDE 설정은 [팀원 연결 안내](../docs/ai/team-server-connection.md)를 참고한다.
앱은 계속 각 팀원의 오늘도 백엔드 주소를 사용한다.
게이트웨이가 받을 수 있는 최대 대기10분+처리15분을 고려해 원격 HTTP 제한을 30분으로 둔다.
프록시 타임아웃은 26분이다. AI 자체의 생성 속도는 개선되지 않는다.

## 운영과 키 폐기

`sudo systemctl restart oneuldo-ai`, `sudo journalctl -u oneuldo-ai -f`.
키를 폐기하려면 `/etc/oneuldo-ai/keys.properties`에서 해당 팀의 해시 행을 삭제하고 서비스를 재시작한다.
키를 교체할 때는 새 이름으로 발급해 적용 확인 후 옛 키를 폐기한다. 재시작하면 진행 중 요청이 끊길 수 있으므로 사용하지 않을 때 적용한다.
서버 재부팅 후 Ollama/Caddy/게이트웨이 상태와 외부 접속을 다시 확인한다.

### 구간 관찰의 구조화 출력

`/api/chat`의 선택적 `format`에는 공유 클래스 `ObservationOutputSchema.VALUE`와 동일한 JSON Schema만 허용한다. 게이트웨이는 검증한 스키마를 Ollama의 `format`으로 전달한다. 임의 스키마와 `format: "json"`은 400으로 거부한다. `format`이 없는 기존 호출은 그대로 동작한다.

스키마는 `summary`, `observations`, `uncertainties`, `requestedSegmentIds`를 필수로 하고, 각 관찰에는 `observation`, `interpretation`, `alternativeExplanations`, `evidenceEventIds`를 사용한다. ID 형식은 `E`와 양의 정수로 제한한다. 실제 입력에 포함된 ID인지, 요청 구간의 근거인지, 문자열 길이 및 내용의 타당성은 백엔드 검사 책임이다. 긴 문자열의 `maxLength`는 현재 서버의 문법 복잡도 한도를 초과하므로 생성 스키마에 넣지 않는다. 출력 토큰 상한과 백엔드의 2,000자 검사는 유지한다.

적용 범위는 구간 관찰·중간 통합·추가 이동 상세 관찰이다. 최종 분석 및 퀘스트 생성은 기존 출력 계약을 유지한다. 이 변경은 필드 혼동을 줄이기 위한 것이며 사실 정확성을 보장하지 않는다.

운영 교체는 검증한 jar와 SHA-256 파일, `deploy/update-schema.sh`를 같은 디렉터리에 둔 뒤 `sudo bash update-schema.sh`로 수행한다. 기존 jar를 백업하고 서비스 재시작 후 상태 확인이 실패하면 복원한다. 키·Caddy·포트포워딩·Ollama 설정은 이 스크립트에서 수정하지 않는다.


### 큰 문맥 요청

`options.num_ctx`는 8192(기본값) 또는 18432를 지원합니다. 입력과 예약 출력의 합은 선택한 문맥에서 256토큰을 뺀 값 이하이어야 합니다. `num_predict` 상한 1800과 추론 동시 실행 1개는 유지됩니다. 기존 클라이언트는 8192로 계속 사용할 수 있으며, 큰 문맥은 업데이트된 게이트웨이 설치 후 명시적으로 요청해야 합니다.
