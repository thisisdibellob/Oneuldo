# 외부 AI 서버 연동 검증

## 실제 분석 API: 성공

앱 화면 조작 대신 앱에서 사용하는 로컬 Spring 백엔드 HTTP API를 호출했다. 합성 테스트 계정을 사용했으며 기존 사용자 기록을 수정하지 않았다. 진단 과정의 합성 계정 3개와 각 5개 이벤트는 로컬 DB에 남아 있다.

- 회원 생성/로그인 → 행동 기록 5개 업로드 → 분석 작업 생성 → 작업 및 결과 조회 순서로 검증했다.
- 이벤트 5개 모두 ACCEPTED, 수신 순번 1~5 확인.
- 최종 작업 및 분석 결과: READY.
- 모델: qwen3.6:27b-q4_K_M.
- 분석 처리 시간: 364,826ms (약 6분 5초).
- 폴링으로 완료를 확인하기까지: 375.3초.
- 모델 호출: 1회. 관찰 결과 2개와 연습 계획을 반환했다.
- 화면 표시, 다중 사용자 부하, 해석의 타당성을 검증한 결과는 아니다. 생성 결과에는 단일 행동에서 능력을 추론하는 표현이 포함돼 있다.

## 발견한 오류와 수정

ollama 프로필 기본값이 local.properties의 주소/API 키/타임아웃을 덮어써 예전 SSH 터널 주소로 요청하고 있었다. run-home-ai.sh에 spring.config.additional-location을 지정하여 외부 로컬 설정의 우선순위를 보장했다. IDE 안내도 갱신했다. 설정 우선순위 회귀 테스트와 HTTPS API 키 클라이언트 테스트가 통과했다.

## 서버 재부팅: 성공

사용자가 sudo reboot를 실행한 뒤 자동 SSH 재접속으로 확인했다. boot_id가 1ec87f7d-f16e-4ade-acd6-c3dcfaf2a67e에서 7e24bbdb-ddc7-4712-b32a-fdbdf5411f2a로 바뀌어 실제 재부팅을 확인했다. Ollama, oneuldo-ai, Caddy 세 서비스 모두 enabled 및 active였다. 수동 서비스 시작은 하지 않았다.

공개 HTTPS 주소의 healthz가 up을 반환했고, 로컬 설정의 API 키로 실제 27B 모델 호출도 성공했다. 응답은 “재부팅 후 AI 연결에 성공했습니다.”, 전체 HTTP 요청은 26.26초, 모델 로딩은 약 16.94초였다. 상세 증거는 reboot.json에 저장했다. 절전/덮개 동작 및 정전 후 전원 복구는 이번 검증 범위에 포함하지 않았다.

상세 합성 결과: analysis.json. 최초 실패: analysis-before-fix.json. 중간 실패: analysis-import-only.json. 현재 백엔드 로그: backend-current.log.
