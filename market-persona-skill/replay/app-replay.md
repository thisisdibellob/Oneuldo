# 앱 연결과 재생

생성·검증만 요청받았다면 이 문서는 필요 없다. 앱 재생까지 요청받았을 때 아래 순서를 따른다.

## 연결과 생성

1. [실행 안내](../../market-simulator/README.md)에 따라 전용 DB·인증키·테스트 계정과 개발용 웹앱을 준비한다. `MARKET_REPLAY_CONFIG`의 private 파일에 정확한 app/backend origin, 계정 allowlist, `isolated:true`를 설정한다. 운영 대상은 지원하지 않는다. 이 설정은 격리의 원격 증명이 아니므로 이미 실제 분리를 확인한 환경을 사용한다.
2. 지속 실행되는 MCP에서 `pair_app_session({appOrigin,backendOrigin,memberId})`을 호출한다. 반환 URL을 새 개발용 앱 탭으로 열고 지정 계정으로 로그인한다. URL의 일회성 토큰은 저장·공유·보고서 기록하지 않는다. 앱은 fragment를 메모리로 읽고 주소에서 제거한다.
3. 장보기 미션 시작 화면에서 `list_app_sessions`로 계정·백엔드·`ready:true`·`visible:true`와 snapshot ID를 확인한다. 사용자가 시작 버튼을 미리 누르지 않도록 한다. trace의 `start`가 기존 버튼을 누른다.
4. Luna 전체 계획은 `prepare_whole_trace({personaId,seed,tabId})` → 해당 bundle만 받은 새 actor 문맥에서 전체 행동 계획 작성 → `submit_whole_trace({requestId,candidate})`로 저장한다. 새 기본 형식은 bundle 8 / candidate 7이며 행동은 현재 화면·위치에 묶인 `choiceRef`로 선택한다. 매 결정의 `basis.goalId`·`memoryUses`와 필요한 `actorState.taskUpdate`·`memoryUpdate`는 [전체 계획 절차](../generation/whole-trace.md)의 계약을 따른다. `taskUpdate`는 한 건이어도 배열이다. `basis.intent`와 `actorState.activity`는 서로 다른 허용값을 사용한다. 직전 행동 결과와 같은 결정의 taskUpdate를 반영한 행동 직전 상태를 작성한다. 기존 candidate 6/5/4/3은 각자의 형식과 검증 의미를 유지한다. 기존 증분 provider 생성은 `generate_trace({personaId,seed,tabId})`를 사용한다. 오프라인 생성에는 실제 시작 전 snapshot 또는 snapshotFilePath를 대신 사용한다. 원격 LLM 모드 키는 `llm.apiKeyEnv`에 환경변수 이름으로만 전달한다.
5. `validate_trace({traceFilePath,tabId})`가 성공한 뒤 `play_trace({traceFilePath,tabId})`로 전체 trace를 전달한다. 미션이 달라졌으면 새 snapshot으로 다시 생성한다. 좌표·로그·대상 ID를 사후 변조하지 않는다. 생성·검증만 요청받으면 저장된 snapshot으로 생성하고 검증까지만 수행하며, 앱 재생·DB 전송·분석 요청은 실행하지 않는다.

## 재생과 검증

`replay_status({replayId})`로 실제 앱의 진행·완료·실패·측정값을 확인한다. AI 분석 흐름은 요청 수락을 기다린 후 나가기까지 수행한다. 중단은 `stop_replay({tabId})`로 요청하며 앱 확인까지 lease가 유지된다. 연결 상실·heartbeat 만료·화면 숨김·미션/계정 변경 시 중단을 해결하고 새 pairing으로 시작한다. 다른 계정의 앱 탭은 병렬 실행할 수 있다. 같은 계정·탭 중복 실행은 허용하지 않는다.

이동은 실제 앱의 joystick과 게임 루프를 사용하고 상품은 기존 드래그 경로를 거친다. 순간이동이나 trace를 작은 이동명령으로 나눠 RPC 전송하는 방식은 사용하지 않는다. 증분 계획은 관찰하지 않은 정답을 주입하지 않는다. 전체 계획에서도 세계 참고 자료의 미발견 상품·장소를 인물의 지식으로 사용하지 않는다. Node의 화면·발견 기억 감사와 기존 이동·재고 가드는 선언된 행동 근거를 검사하며 모델 내부의 판단까지 증명하지는 못한다. 화면 움직임·드래그와 실제 앱 측정값을 확인한다. `whole-trace-v3`는 `timingProfile` 기본값/허용값이 `original`이며 Luna의 행동 전 지연과 개인 보행 기준을 보존한다. 명시적 `compact`는 거절하고 결과에 `actor-preserved-v1`을 기록한다. 다른 경로의 compact 재생 일정은 시험 시간을 줄이는 설정이며 사람의 반응 속도·능력 향상 지표가 아니다. trace 스키마 통과나 생성기의 실행 가능성 검사만으로 부드러운 화면 재생·백엔드 수락이 검증됐다고 보고하지 않는다.

`replay-manifest.jsonl`로 trace/hash·replay·탭·테스트 계정·questInstanceId·실제 tracker sessionId를 연결한다. 기존 `BehaviorLogRequest`에 합성 태그를 추가하지 않으므로 전용 DB/계정 격리를 유지한다. 보고에는 실행 모드, 페르소나/정책 버전, seed, trace 파일과 replay ID, 실제 완료 상태 및 확인한 앱 지표를 남긴다. 인증정보나 pairing URL은 제외한다.
