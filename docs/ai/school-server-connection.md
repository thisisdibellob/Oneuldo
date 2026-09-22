# 학교 TITAN 서버 연결

2026-09-16 학교 서버의 공개 HTTPS를 설치하고 외부 연결을 확인했다. 기본 AI 주소는 `https://oneuldo.duckdns.org`이다. 기존 노트북의 Ollama, Spring 게이트웨이, API 키, `https://bluem.myvnc.com` 서비스는 변경하지 않았다. 다른 팀원의 설정은 자동으로 바뀌지 않는다.

## 현재 연결

앱 → 각 팀원의 Spring 백엔드 → `https://oneuldo.duckdns.org` → 학교 Caddy → Spring 게이트웨이 `127.0.0.1:8081` → Ollama `127.0.0.1:11434`.

- AI 요청에는 SSH 터널, 관리자 맥북, 집 노트북이 필요하지 않다.
- 모델: `qwen3.6:27b-q4_K_M`, digest `3a40c32f1450b8380412898385b0e00df5d6d2d801dd192ca1acb7e735cd050e`.
- GPU: 물리 GPU 1, TITAN RTX 24GB. 기존 `GGML_VK_VISIBLE_DEVICES=1` 및 CUDA UUID 선택 설정을 유지한다.
- 2026-09-21부터 학교 클라이언트 기본 문맥은 18,432토큰·요청 예산은 18,000토큰이다. 기존 팀원 로컬 설정도 갱신해야 한다. 게이트웨이는 8,192와 18,432를 모두 지원하고 노트북용 설정은 8K로 유지한다.
- 공개 포트는 HTTPS TCP 443이다. 게이트웨이와 Ollama는 loopback에서만 수신한다.
- `ollama`, `oneuldo-ai`, `oneuldo-https`는 active/enabled 상태다.
- 키별 인증과 단일 추론 대기열을 유지한다. 노트북으로 자동 재요청하는 기능은 없다.

관리자 맥의 `backend/local.properties`를 공개 HTTPS로 전환하고 백엔드를 재시작했다. 로그인 API는 HTTP 200이다. 기존 SSH 소켓과 11436/11437 로컬 터널 포트가 닫힌 것도 확인했다.

팀원 설정과 개별 키 발급 방법은 [팀원 AI 서버 연결](team-server-connection.md)을 따른다. 학교 서버에서 발급한 키를 입력해야 하며, 기존 노트북 키는 사용할 수 없다.

```bash
python3 backend/scripts/configure-home-ai.py
bash backend/scripts/run-home-ai.sh
```

실행 스크립트 이름의 `home`은 기존 명령 호환을 위해 남겨두었다. 이제 설정 스크립트는 학교 서버를 기본으로 사용한다. `--server laptop`을 명시하면 기존 노트북을 선택할 수 있다.

## 외부 검증과 남은 한계

- 맥에서 공개 인증서 검증 및 `/healthz` 정상 응답을 확인했다.
- 공개 `/api/tags`는 무인증 401, 학교 키로 인증 시 200 및 모델 목록을 반환했다.
- 18:02 실제 프로젝트 `RestOllamaChatClient`로 공개 HTTPS 테스트 1개가 통과했다(건너뛰기 0). 입력 62토큰, 출력 17토큰, 호출 14.134초. 응답: `사용자는 우유 수량을 2개에서 1개로 수정했다.`
- 사용자가 휴대폰 Wi-Fi를 끈 데이터망에서도 `/healthz` 정상 응답을 확인했다.
- 그 후 맥에서 추가 확인한 3회 중 2회는 약 1초에 성공했고 1회는 8초 연결 시간 초과였다. **공개 접속은 확인했지만 간헐적인 연결 문제는 해결되었다고 볼 수 없다.** 장애 원인은 아직 특정하지 못했다.
- 서버 내부 HTTPS와 UFW TCP 443 허용은 확인했다. 과거 17:59 패킷 진단은 클라이언트 시험과 시간이 맞지 않았으므로 패킷 0건을 상위 네트워크 차단의 증거로 사용하지 않는다.
- 전환 후 18:12 및 18:13 실제 클라이언트 테스트는 두 번 모두 연결 시간 초과(`HttpConnectTimeoutException`)로 실패했다. 로컬 설정 우선순위 검증은 통과했다. 앞선 AI 호출 성공과 함께 기록하며, 현재 경로가 안정적이라고 판단하지 않는다.
- 18:19 사용자가 휴대폰 데이터망·와이파이 모두 정상 응답을 확인했다. 맥에서는 상태 확인 3회 중 1회 시간 초과, 2회 HTTP 200이었다. 이어 실제 `RestOllamaChatClient` 테스트는 1개 통과(실패·건너뛰기 0), 입력 62·출력 17토큰, 호출 11.147초로 성공했다. 응답은 `사용자는 우유 수량을 2개에서 1개로 수정했다.`이다. 이때 SSH 터널 포트 11436/11437은 닫혀 있었고 로컬 백엔드는 공개 학교 URL로 실행 중이었다. 이는 터널 없는 AI 호출 성공이며, 앞서 관찰한 간헐적 시간 초과가 해결되었다는 뜻은 아니다.
- 짧은 AI 호출 성공과 `/healthz` 응답은 동시 사용자 부하나 긴 분석의 안정성을 보장하지 않는다.

## 관리자 SSH

- 점프 서버: `jeonghoon@117.16.44.109:22022`
- AI 서버: `duream@117.16.44.110:22022`

SSH는 서비스 관리할 때만 사용한다. 인수인계된 동시 접속 제한을 고려해 기존 연결을 재사용하고 관리 명령은 순서대로 실행한다. 기존 소켓이 살아 있다면 새 master를 만들지 않는다.

```bash
ssh -M -S "$HOME/.ssh/oneuldo-school.sock" -N \
  -J jeonghoon@117.16.44.109:22022 \
  -p 22022 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  duream@117.16.44.110
```

다른 맥 터미널에서 같은 연결을 사용한다. 소켓이 없을 때 새 로그인을 시도하지 않도록 `ProxyCommand=false`를 지정한다.

```bash
ssh -t -S "$HOME/.ssh/oneuldo-school.sock" \
  -o ControlMaster=no -o ProxyCommand=false \
  -p 22022 duream@117.16.44.110
```

서버에서 상태와 로그를 확인한다.

```bash
systemctl is-active ollama oneuldo-ai oneuldo-https
sudo journalctl -u oneuldo-ai -n 50 --no-pager
sudo journalctl -u oneuldo-https -n 50 --no-pager
```

## 설치 구성

- Ubuntu 20.04.6의 시스템 Java 11은 유지한다. 게이트웨이 전용 Java 21은 `/opt/oneuldo-java21`에 설치했다.
- `/opt/oneuldo-ai`의 Spring 게이트웨이는 `oneuldo-ai.service`로 실행된다.
- DJL 0.36.0 기본 JNI 바이너리의 glibc 호환 문제는 동일 버전의 원본 Rust 소스를 학교 서버에서 빌드해 해결했다. 소스와 확정 Cargo.lock은 배포의 `tokenizer-source.tar.gz`, 출처는 `native-build-metadata.json`에 보존했다.
- 토큰 수 8개 입력의 맥/학교 일치, 인증 401/200, 문맥 초과 400, 실제 추론 및 GPU 1 적재를 검증했다.
- `/opt/oneuldo-caddy/caddy`: Caddy v2.11.4 + `dns.providers.duckdns v0.5.0`.
- 구성 `/etc/oneuldo-caddy/Caddyfile`, 서비스 `oneuldo-https.service`, 상태 `/var/lib/oneuldo-caddy`.
- `/api/chat`, `/api/tags`, `/healthz`만 게이트웨이에 전달한다. 관리 API와 HTTP 리다이렉트는 비활성화했다.
- UFW에는 TCP 443만 추가했다. 기존 SSH 규칙, GPU 선택 파일, 집 노트북은 변경하지 않았다.

최초 TLS-ALPN 인증서 발급은 일부 검증 지점의 연결 시간 초과로 실패하여 **DNS-01로 전환해 발급에 성공했다**. 최종 구성은 저장소의 `ai-gateway/deploy/Caddyfile.school-dns`와 `enable-school-dns-tls.sh`에 있다. 초기 `install-school-https.sh`를 재실행하면 이전 구성으로 돌아갈 수 있으므로 현재 구성 유지 시 실행하지 않는다.

DuckDNS 토큰은 서버의 숨김 프롬프트로 입력했고 `/etc/oneuldo-caddy/duckdns.env`에 root 전용 600 권한으로 보관한다. Caddy가 인증서 자동 갱신에 사용한다. 토큰을 채팅·Git·명령줄에 넣지 않는다. DNS 확인은 `8.8.8.8:53`을 사용하며 HTTP 80이나 UDP 443은 열지 않았다. 학교 IP가 바뀌면 DuckDNS A 레코드도 갱신해야 한다.

공식 자료: [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https), [Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge), [Caddy DuckDNS 모듈](https://github.com/caddy-dns/duckdns).

## 노트북 설정 보존

노트북 전환 전 로컬 설정은 맥의 `~/.local/share/oneuldo/backups/local.properties.before-school-20260916`에 소유자 전용 권한으로 보관했다. API 키와 DB 설정이 포함되므로 공유하거나 Git에 추가하지 않는다. 수동 복원 시 AI 주소와 API 키만 복원하고 그 사이 변경된 DB 설정을 덮어쓰지 않는다.

학교 관리자 키는 맥의 `~/.local/share/oneuldo/school-gateway-client.key`에 600 권한으로 저장했다. 팀원에게는 서버에서 별도 키를 발급한다. SSH에서 공개 HTTPS로 전환하기 직전 설정도 같은 백업 폴더의 `local.properties.before-school-public-20260916`에 보관한다.

## 이전 Ollama 직접 연결 검증 기록

- 실제 `RestOllamaChatClient` 연결 테스트: 1개 통과, 관찰 사실 응답 성공, 호출 시간 10.924초.
- 18,432토큰 문맥 설정의 짧은 합성 요청: HTTP 왕복 약 14.6초, 모델 로딩 약 13.6초. 출력 21토큰 생성 약 0.69초. 긴 플레이 로그의 처리 속도를 의미하지 않는다.
- 해당 요청 후 `/api/ps`: `size`와 `size_vram`이 모두 17,426,295,028바이트로 같고 문맥은 18,432였다. 전체 모델 GPU 적재를 확인했다. 물리 GPU 번호는 별도의 `nvidia-smi`로 확인해야 한다.
- 2026-09-16 동일한 합성 플레이 322개 사건의 실제 재분석: READY, 194.166초(3분 14초), 모델 호출 4회. 기존 노트북 분석 1,358.952초(22분 39초) 대비 이번 실행은 약 7배 빨랐다. 프로필 갱신은 양쪽 비교에서 제외했다. 출력 길이 차이가 있는 단일 실행이며 고정 성능 배수는 아니다.
- 분석 결과에는 품목 3개 지원 제안과 2개 구조화 계획의 불일치, 전체 입력을 세션 일부라고 표현하는 문제 등이 남았다. 상세 원문과 검토는 `tmp/school-analysis-20260916/report.md`에 저장했다.
- 동시 사용자 부하는 아직 검증하지 않았다.

## 2026-09-18 접속 장애 조사 및 게이트웨이 갱신

SSH로 내부 서비스와 실제 추론 정상 동작을 확인했다. 외부 접속은 간헐적인 TCP 시간 초과가 지속됐고, 서버 패킷 캡처와 동시에 시행한 실패 요청 5건의 SYN이 enp5s0에 관측되지 않았다. 서버 UFW의 443 허용은 유지되어 있었다. 학교 상위망·인터넷 경로·클라이언트 네트워크 대조가 필요하며 정확한 차단 지점은 확정하지 않았다.

별도로 재현한 `UNSUPPORTED_OUTPUT_SCHEMA` 오류는 게이트웨이를 갱신해 수정했다. 12:25 KST 적용한 JAR은 기존/신규 관측 스키마를 모두 허용하며, 관리자 키로 새 스키마의 실제 관측 생성 HTTP 200 및 빈 대안 배열을 확인했다. 키 없는 요청은 401, 임의 스키마는 400으로 계속 차단한다. 백업은 `/opt/oneuldo-ai/oneuldo-ai-gateway.jar.before-schema-20260918-122512`다. GPU·키·방화벽·Caddy·DNS 설정은 바꾸지 않았다.

공유 검증 요약: [검증 기록](validation-2026-09-18.md). 원시 기록과 네트워크 담당자 전달 문서는 관리자 로컬의 `output/server-connectivity-2026-09-18/`에 보존한다.
