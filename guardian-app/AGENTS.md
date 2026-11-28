# 보호자 앱 작업 기준

- 이 폴더는 자녀 게임 frontend와 별도 Expo 앱이다. 자체 package.json·잠금 파일·assets를 유지하고 frontend의 내부 모듈이나 node_modules를 실행 의존성으로 참조하지 않는다.
- 먼저 README.md와 docs/API.md를 읽는다. guardian API는 계약만 작성된 상태이며 현재 백엔드에 존재한다고 가정하지 않는다.
- 실서버 오류를 시연 데이터로 대체하지 않는다. 시연은 명시적 버튼으로 진입하고 모든 화면과 상세에서 표시한다. synthetic/페르소나 자료를 실제 자녀 결과로 분류하지 않는다.
- 부모–자녀 관계 인가는 서버의 책임이다. 부모 본인의 /behavior-analyses/latest를 자녀 분석으로 사용하지 않는다. 보고서의 childId도 확인한다.
- 비밀번호·토큰을 로그나 디스크에 저장하지 않는다. .env.local, node_modules, .expo, dist는 커밋하지 않는다.
- 기본 서버 포트는 8082다. 기존 게임 서버와 앱 식별자를 공유하지 않는다. 외부 터널을 실행하면 실제 주소와 manifest username을 확인하고 QR·Expo Go 링크·웹 링크를 제공한다.
- pnpm typecheck, pnpm test, pnpm build:web, pnpm exec expo install --check를 사용한다. 브라우저 검증과 Expo Go 실기기 검증을 구분한다.
- 루트 AGENTS의 테스트 기록 보관·Git 안전 규칙을 따른다. develop/backend와 기존 게임은 명시적인 해당 작업 없이 변경하지 않는다.
