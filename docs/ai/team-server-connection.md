# 팀원 AI 서버 연결

서버 주소는 `https://bluem.myvnc.com`이다. 팀원 백엔드가 HTTPS와 Bearer API 키로 Spring AI 게이트웨이에 요청한다. 게이트웨이는 서버 내부 Ollama에 요청하며, 팀원에게 SSH나 VPN은 필요하지 않다. 모델은 `qwen3.6:27b-q4_K_M`, 컨텍스트는 8192다.

## 최초 설정

1. 게이트웨이 연동 코드가 포함된 브랜치의 최신 프로젝트를 받는다.
2. 서버 관리자에게 본인 전용 API 키를 전달받는다. SSH 키 암호, 서버 비밀번호, DDNS 키와 다른 값이다.
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

수동 설정을 원하면 `backend/local.properties`에 아래 세 항목을 설정한다.

```properties
ai.ollama.base-url=https://bluem.myvnc.com
ai.ollama.api-key=본인에게_발급된_API_키
ai.ollama.timeout=PT30M
```

환경변수 방식은 `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, `OLLAMA_TIMEOUT`을 사용한다. 로컬 파일에 같은 항목을 중복 설정하지 않는다. 키를 프런트엔드, `EXPO_PUBLIC_*`, Git, 채팅 로그에 넣지 않는다. 프런트엔드는 기존처럼 본인의 프로젝트 백엔드에 연결한다. 로컬 모델로 동기식 퀘스트 생성도 사용할 경우 `frontend/.env.local`에 `EXPO_PUBLIC_AI_TIMEOUT_MS=1800000`을 설정하고 Expo를 재시작한다. 이 값은 대기 시간이며 비밀키가 아니다.

## 서버 관리자: 팀원 추가

서버 SSH 터미널에서 팀원마다 다른 이름으로 실행한다.

```bash
sudo /opt/oneuldo-ai/add-key.sh member2
sudo systemctl restart oneuldo-ai
sudo cat /etc/oneuldo-ai/issued/member2.key
```

마지막 출력은 해당 팀원에게 개인적으로 전달한다. `member1`은 기존에 발급한 키다. 추가 팀원은 `member3` 등 새 이름을 쓴다. 재시작은 진행 중인 요청에 영향을 줄 수 있으므로 사용 중인 요청이 없을 때 한다. 키 해시는 시작 시 읽으므로 추가 후 재시작해야 한다.

## 사용 및 확인

- `https://bluem.myvnc.com/healthz`에서 `{"status":"up"}`이면 게이트웨이에 연결된 상태다. 실제 모델 응답까지 보장하는 검사는 아니다.
- 401: 키 누락 또는 잘못된 키. 설정 스크립트로 다시 확인한다.
- 429: 같은 키로 요청이 진행 중이거나 서버 대기열이 가득 찼다. 기존 요청을 기다린 후 다시 시도한다.
- 서버는 AI 요청을 한 번에 하나 처리한다. 여러 팀원은 대기하며, 긴 분석에는 수 분 걸릴 수 있다.
- 서버 전원과 인터넷 연결이 필요하다. 관리자 맥북이나 SSH 터널은 AI 서비스 운영에 필요하지 않다.
- No-IP 무료 호스트는 정기 확인이 필요하므로 만료 안내를 처리한다.

관리 로그는 서버에서 `sudo journalctl -u oneuldo-ai -f`로 확인한다. HTTPS 문제는 `sudo journalctl -u caddy -n 40 --no-pager`로 확인한다.
