# 오늘도 노트북 Codex 인수인계

작성일: 2026-09-11. 대상은 `thisisdibellob/Oneuldo`의 Expo 앱이다. 별도로 소개글을 작성했던 Unreal 게임 `gamejam2026`는 이 작업과 관계없다.

## 1. 가장 먼저 알아야 할 현재 상태

- 공식 저장소: https://github.com/thisisdibellob/Oneuldo
- 이 PC의 실제 개발 경로: `C:\Users\PC\Documents\Oneuldo\frontend`
- 현재 브랜치: `feat/8-시뮬레이션-게임-ui-제작` / 연결 원격: `origin/feat/8-시뮬레이션-게임-ui-제작`
- 작업 이전의 이력 기준: `cda4bafb29bc3b3f5e796165d52942507ee39406` — `feat: 마트·요리·계산원 시뮬레이션과 대화 에셋 개선` (2026-09-11 05:53:57 KST). **노트북에서 이 과거 커밋으로 되돌리지 않는다.**
- **현재 코드·이미지·인수인계 문서는 같은 작업 브랜치에서 Git으로 전달한다. 별도 전달 ZIP은 필요 없다.** PC의 Push 완료를 확인한 뒤 아래 브랜치를 clone/pull하고, 그 checkout에 포함된 이 문서를 읽는다.
- 실제 최신 커밋은 Push 완료 안내와 `git log -1`에서 확인한다. 이 문서 안에 이전 작업 시점의 해시가 있다고 해서 그 해시를 최신 목표로 사용하지 않는다.
- 이전 `C:\Users\PC\Documents\serious-game-build`는 옛 저장소다. 새 앱 코드를 그곳에서 개발하지 않는다.

## 2. 노트북에서 Git으로 안전하게 이어받는 방법

### 저장소를 새로 받을 때

기존 작업 폴더와 겹치지 않는 위치에서 다음과 같이 현재 작업 브랜치를 받는다.

```powershell
git clone --branch "feat/8-시뮬레이션-게임-ui-제작" https://github.com/thisisdibellob/Oneuldo.git Oneuldo-notebook
cd Oneuldo-notebook
git status --short --branch
git remote -v
git log -1 --oneline
```

### 노트북에 기존 checkout이 있을 때

1. 저장소 루트에서 `git status --short --branch`, `git branch -vv`, `git remote -v`로 변경사항·현재 브랜치·연결 원격을 확인한다. 공식 저장소가 `thisisdibellob/Oneuldo`인지 확인하고 다른 remote를 임의로 바꾸지 않는다.
2. **미커밋 변경이나 충돌이 있으면 먼저 보존하고 알린다.** 임의로 삭제·덮어쓰기·reset·stash하지 않는다. 기존 폴더를 건드리지 않고 작업하려면 위처럼 별도 폴더에 clone한다.
3. 작업 트리가 깨끗할 때만 현재 작업 브랜치를 선택하고 최신화한다.

```powershell
git fetch origin
git switch "feat/8-시뮬레이션-게임-ui-제작"
git pull --ff-only origin "feat/8-시뮬레이션-게임-ui-제작"
git status --short --branch
git log -1 --oneline
```

로컬에 해당 브랜치가 없다면 fetch 후 `git switch --track "origin/feat/8-시뮬레이션-게임-ui-제작"`으로 만든다. `pull --ff-only`가 실패하면 로컬·원격 이력 차이를 확인하고 사용자에게 알린다. 기존 노트북 커밋을 없애거나 자동 merge/rebase로 해결하지 않는다.

### 파일과 실행 확인

- 최신 checkout의 `docs/handoff/notebook-handoff-2026-09-11.md`와 아래 팀 보고서를 읽는다. 이 문서가 포함된 커밋은 소스·이미지와 함께 전달되므로 ZIP이나 패치를 추가로 적용하지 않는다.
- NPC의 게임용 PNG와 고해상도 PNG는 `frontend/assets/images/game/market/people/` 및 그 안의 `illustrations/`에서 확인한다. 생성 기록의 PC 전용 경로를 복원할 필요가 없다.
- `frontend/`에서 아래 의존성 설치·타입 검사·테스트·빌드·smoke 명령을 실행한다. `node_modules`, `.expo`, 빌드 결과, 로그인 정보와 로컬 환경 파일은 Git으로 옮기지 않으므로 설치·로그인은 노트북에서 수행한다.
- 이후 사용자가 Push/PR을 요청하면 현재 개인 작업 브랜치에 커밋·Push하고 `develop` 대상으로 PR을 만든다. 관련 Issue는 현재 브랜치의 `#8`을 확인하여 연결한다.

## 3. 버전과 실행

현재 `frontend/package.json`과 `pnpm-lock.yaml`의 실제 버전:

| 항목 | 버전 |
| --- | --- |
| Expo | `~57.0.21` |
| React Native | `0.86.3` |
| React / React DOM | `19.2.3` |
| TypeScript | `~6.0.3` |
| Jest / jest-expo | `29.7.0` / `~57.0.5` |
| 이 PC에서 확인한 Node / pnpm | `24.18.1` / `10.30.1` |

**기존 AGENTS의 SDK 54·React Native 0.81·Issue #1 정보는 초기 기록이다. 사용자가 SDK 57 업그레이드를 직접 요청하여 이미 적용했다. 이를 근거 없이 SDK 54로 되돌리지 않는다.** 패키지 버전의 기준은 현재 코드와 잠금 파일이다.

`frontend`에서:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:web
pnpm exec expo install --check
node scripts/market-agent-smoke.cjs --output .expo/market-smoke-episode.json
```

웹만 확인할 때는 `pnpm web`을 사용한다. 일반 앱은 `http://localhost:8081/`, 개발용 장보기 바로가기는 `http://localhost:8081/?marketLab=1`이다. 실제 서버가 다른 포트를 출력하면 해당 포트로 바꾼다. `marketLab`은 개발 웹 전용이며 실제 앱 진입은 **게임 → 출발하기 → 마을의 하늘마트**이다.

### 사용자가 “서버 열어줘”라고 하면

이 표현은 **Expo Go 모드 + 외부 터널 + 접속 링크 + QR**까지 제공하라는 뜻이다. 사용자는 ngrok의 공개 `exp.direct` 터널로 앱 코드·이미지·폰트를 제공하는 방식을 승인했다.

```powershell
pnpm exec expo whoami
# 로그인되어 있지 않으면 공식 브라우저 로그인 사용
pnpm exec expo login --browser
pnpm exec expo start --go --tunnel --clear --port 8081
```

Windows에서 `pnpm exec expo`가 명령을 못 찾으면, 설치된 공식 CLI를 직접 실행할 수 있다.

```powershell
node node_modules/expo/bin/cli whoami
node node_modules/expo/bin/cli login --browser
node node_modules/expo/bin/cli start --go --tunnel --clear --port 8081
```

- 이 PC의 CLI 계정은 인수인계 때 공식 서버에서 `violeillicit`로 확인했다. 노트북에는 별도 로그인해야 하며 PC의 로그인 파일을 옮기지 않는다.
- iPhone Expo Go와 PC CLI의 동일 계정 로그인을 확인한다. 사용자는 휴대폰만 볼 수 있는 경우가 있으므로 PC 화면 조작만 요구하지 말고 모바일에서 가능한 공식 로그인·승인 흐름을 안내한다. 비밀번호를 채팅으로 요청하지 않는다.
- 서버가 이번 실행에서 출력한 **현재 터널 주소**를 읽는다. 이전 세션 URL이나 QR을 그대로 사용하지 않는다.
- 외부 iOS/Android manifest의 SDK·번들 주소·응답과 `extra.expoGo.username`을 확인한다. HTTP 200만으로 휴대폰 로그인 및 실제 실행이 완료됐다고 말하지 않는다.
- **현재 URL의 QR, `exp://` 또는 `exps://` Expo Go 직접 링크, 별도의 `https://` 웹 링크**를 함께 준다. localhost만 알려 주고 끝내지 않는다.
- 개발 서버와 터널은 사용자가 닫아 달라고 할 때까지 유지한다. 노트북의 localhost는 노트북 자신이며 기존 PC 서버가 자동으로 옮겨지는 것은 아니다.
- `pnpm start:tunnel`은 과거 cloudflared 스크립트이므로 이 요청에는 위 공식 Expo `--go --tunnel` 명령을 사용한다.
- Windows에서 백그라운드 프로세스를 만들면 `Start-Process -WindowStyle Hidden`을 사용한다. 이미 있는 다른 서버나 프로세스를 일괄 종료하지 않는다.

## 4. 지금까지 구현한 장보기 기능

| 영역 | 최신 구현 |
| --- | --- |
| 실험 환경 | seed, 사람·기둥 수와 후보 위치, 진열대 순서, 계산원·키오스크, 상품·재고·필요 수량·판정 난이도를 JSON으로 입력·저장 |
| 마트 구조 | 1100×1200, 입구와 출구 분리, 출구 쪽 세로 계산대 2개, 입구 경보기, 고정 휴게석 2세트, 장식용 엘리베이터·ATM |
| 상품 | 과일/채소·냉장 식품·생활용품·간편 식품·음료의 5분류, 각 24종으로 총 120종. 분류마다 9종을 뽑아 4×3칸에 표시하며 3칸은 중복 진열·같은 재고 공유 |
| 쌍 진열대 | 각 분류의 두 그림이 하나의 목적지·선택·재고로 작동. 과일/채소와 냉장 진열대는 평행한 정면 그림으로 교체 |
| 사람 | 매장 종업원 1~3명·손님 1~5명 랜덤 배치. 계산원 0~2명은 별도. 종업원 4종, 손님 성인/노인/어린이×남녀 각 2종으로 12종, 합계 16종의 투명 전신 일러스트 |
| 사람 크기 | 플레이어의 그림체·색감에 맞춤. 어린이는 성인 NPC 높이의 76%. 발 위치·터치 영역·충돌 규칙 유지 |
| 구매 정보 | 살 목록은 필요한 수량만, 장바구니는 실제 담은 수량만 표시. 진행 분수·사전 정답 강조 없음 |
| 구매 판정 | 구매 확정 전에는 오답을 알리지 않음. 첫 실패는 성공 여부만, 두 번째 실패부터 오류 상세. 재시도 제한 없음·항상 포기 가능 |
| 상품 반납 | 해당 분류 진열대에서 직접 반납하거나, 매장 종업원에게 원하는 SKU 1개/전부 반납 요청. 재고 복원, 정답을 대신 알려 주지 않음 |
| 계산원 | 계산원이 없는 계산대는 종업원에게 찾아가 계산대 번호를 지정해 요청. 두 계산대를 독립 관리 |
| 경보기 | 미결제 물건을 담고 입구 경보선을 바깥 방향으로 통과하면 감점. 기본 100점·감점 10점, 감점 설정 0~100, 같은 통과 중복 방지 |
| 종료 | 제출 횟수·성공/포기·점수, 난이도/흥미 별점 또는 건너뛰기, 에피소드 JSON 저장 |
| 화면 | 기본 마트 배율 1.3배를 최소값으로 고정. 패널 페이드와 진열대 전환, 전환 중 뒤쪽 터치 방지·모션 감소 대응 |

종업원 3명과 계산원 2명이 모두 등장하면 종업원 외형이 4종이므로 하나는 재사용한다. 매장 종업원끼리·손님끼리·두 계산원끼리는 각 그룹 안에서 중복 없이 고른다. 인물은 배치와 상호작용 대상이며 자율적으로 생활하는 군중 AI를 추가한 것은 아니다.

## 5. 정우·재현에게 전달할 환경과 데이터 계약

팀의 ‘환경 변수’ 요청은 `.env` 비밀값이 아니라 **게임 상황을 바꾸는 실험 설정값**을 뜻한다. 정우·재현은 페르소나 AI와 실행기를 만들고, 이 프론트엔드는 같은 seed/config에서 같은 상황을 재현하는 환경·행동 계약을 제공한다.

- 시작 설정 예시: `frontend/docs/market-environment.example.json`
- 상세 계약: `frontend/docs/market-agent-contract.md`
- 엔진: `createMarketAgentAdapter()` (`frontend/src/game/marketSession.ts`)
- 호출 흐름: 설정 생성 → `observe()` → 모델의 다음 행동 선택 → `act(action)` 반복 → 종료 후 `exportEpisode()`
- 화면 UI와 어댑터는 같은 구매·반납·계산·재시도 엔진을 사용한다. HTTP 서버나 학습용 모델은 이번 작업에 포함하지 않았다.
- `source:'synthetic'`, 실제 모델 버전, `personaId`, `personaVersion`, session ID를 기록한다. 실제 사람 데이터와 페르소나 AI 기록은 구분한다.
- 관측에는 지도가 제공되지만 상품·재고는 연 진열대만, 장바구니는 열었을 때 등에 한정하여 공개한다. 화면의 실제 시각 인지를 재현한 에이전트는 아니다.
- AI 이동은 한 번에 최대 32px 및 경로 충돌을 검사한다. UI 전용 `setPosition`으로 순간이동하면 안 된다. 실제 위치는 실행 때 받은 environment의 station/slot 좌표를 사용하고 옛 좌표를 하드코딩하지 않는다.
- 로그에는 설정·실제 배치·행동·구매 결과·점수·별점·출처를 함께 저장한다. `version:1`과 환경 `layoutVersion:2`를 구분한다. 진행 중 전체 정답 평가가 들어 있는 연구용 export는 차단한다.
- 실제 반응 시간 연구에는 시작과 행동의 실제 시각을 넘긴다. 기본 논리 시계나 검증용 자동 실행 시간을 사람의 반응 시간으로 취급하지 않는다.
- smoke 스크립트는 LLM/장애 페르소나가 없는 소프트웨어 검증이다. 학습 데이터에 실제 참여자 기록으로 섞지 않는다.

## 6. 수정할 위치 지도

| 목적 | 파일 |
| --- | --- |
| 게임과 마트 진입 | `frontend/src/screens/GamePrototypeScreen.tsx`, `MarketSimulationScreen.tsx`, `frontend/App.tsx` |
| 설정·시드·좌표·충돌 | `frontend/src/game/marketEnvironment.ts` |
| 상품군·120종 카탈로그 | `frontend/src/game/marketCatalog.ts`, `marketProductImages.ts` |
| 규칙·상태·AI 관측·에피소드 | `frontend/src/game/marketSession.ts` |
| 완료 기록 보관 | `frontend/src/game/marketEpisodeStore.ts` |
| 마트 렌더링·선택 | `frontend/src/components/game/MarketInteriorLayer.tsx`, `MarketMap.tsx`, `MarketShelfScene.tsx` |
| 환경 설정 UI | `frontend/src/components/game/MarketSetupPanel.tsx` |
| 화면 전환 | `frontend/src/components/game/MarketPanelTransition.tsx` |
| 인물 외형·이미지·크기 | `frontend/src/game/marketPeople.ts`, `marketPeopleArt.ts`, `marketPersonLayout.ts`, `frontend/src/components/game/MarketPersonIllustration.tsx` |
| 가구·배율 | `frontend/src/game/marketFixtureLayout.ts`, `marketShelfLayout.ts`, `prototypeWorld.ts`, `worldZoom.ts` |
| 플레이어 그림체 기준 | `frontend/assets/images/game/characters/player/fresh-v1/chr_player_fresh_front_idle_f00_v2@2x.png` |
| 새 이미지와 생성 기록 | `frontend/assets/images/game/market/`, `docs/design-concepts/2026-09-11-*` |
| 실험 smoke | `frontend/scripts/market-agent-smoke.cjs` |

이미지 생성 기록의 `C:/Users/PC/.codex/generated_images/...` 경로는 이 PC의 생성 원본 위치다. 노트북에서 그 경로를 찾거나 재생성할 필요 없이 Git으로 받은 최종 에셋을 사용한다. `prepare-market-*.cjs`는 제작용 도구이며 일반 실행에 필요하지 않다. 일부 도구의 `sharp` 경로는 실행할 기기에 맞춰 별도로 제공한다.

## 7. 검증된 것과 남은 사항

- 2026-09-11 커밋 준비 때 전체 검증을 다시 실행했다. **TypeScript 검사 통과, 21개 테스트 묶음·171개 테스트 통과, 웹 빌드 성공**을 확인했다.
- 같은 검증에서 smoke도 **336개 이벤트, 구매 확정 2회 후 성공**했다. 5분류 모두 12칸/9종, layoutVersion 2, 최종 100점·paid true를 확인하며 직접 반납과 직원 반납도 검증한다. 이 PC의 검증 기록은 `frontend/.expo/commit-test.log`, `frontend/.expo/commit-web-build.log`, `frontend/.expo/commit-smoke.json`에 있다. `.expo`는 로컬 기록이므로 Git 전달 대상이 아니다.
- 온라인 `pnpm exec expo install --check`는 새 SDK 57 패치 9개의 권장 버전 차이로 종료 코드 1을 반환했다. 현재 Expo `57.0.21`에 대해 `57.0.22`를 권장하며, expo-asset·audio·blur·font·glass-effect·haptics·linear-gradient·splash-screen에도 패치 권장이 있다. **이번 전달에서는 검증한 package.json·잠금 파일을 유지했으며 이 업데이트는 적용하지 않았다.** 노트북에서도 잠금 파일대로 설치하고, 패치 업데이트는 별도 변경으로 검토·검증한다.
- 최초 인수인계 문서 작성 때 `http://localhost:8081/`의 HTTP 200 및 Expo CLI 계정 `violeillicit`을 확인했다. 이 결과는 이 PC의 해당 시점 상태다.
- 위 결과는 각 항목에 명시한 시점의 기록이며 실제 Push 완료·최신 커밋 해시는 완료 안내에서 확인한다. 노트북은 의존성을 설치한 후 전체 검증을 수행한다.
- 실제 iOS/Android 휴대폰의 최종 화면은 직접 검증하지 못했다. 모바일에서 새 NPC 비율, 터치·이동·반납·계산·별점·JSON 공유를 확인해야 한다.
- 웹 기록은 브라우저 localStorage의 최근 최대 20회(크기 제한 적용), 네이티브는 현재 앱 프로세스 메모리다. 앱을 완전히 종료해도 남는 네이티브 영구 보관은 미구현이다.
- ATM·엘리베이터·키오스크는 장식/존재만 구현했다. 결제·금융 기능, 페르소나 모델, 학습 파이프라인·백엔드 자동 업로드는 연결하지 않았다.
- 가격·합계는 표시하지만 예산을 구매 성공 조건으로 판정하지 않는다. 별점은 난이도 1=쉬움/5=어려움, 흥미 1=재미없음/5=재미있음이다.
- 과거 게임 상태를 직접 재개하는 기능은 없다. 환경 스냅샷과 시드로 조건을 재현하고 새 세션을 시작한다.
- SDK 문서에 기록된 기존 Expo Doctor 아이콘 비율 경고(기존 로고 208×76), 테스트의 비동기 `act` 경고가 남아 있다. 출시 준비 완료나 경고 0개라고 보고하지 않는다.
- 기존 서버 로그에는 웹 폰트 timeout·오디오 재생 관련 오류 기록도 있다. 현재 localhost의 HTTP 200만으로 이들 UI 문제가 모두 해결됐다고 판단하지 않는다. 재현되면 해당 화면을 확인한다.

## 8. 팀 보고서 읽는 순서

1. [최신 통합 보고서: 진욱 → 정우·재현](../market-team-report-2026-09-11.md): 읽어 줄 요약, 최신 기능과 역할 분담.
2. [마트 구조 개편 v2](../market-layout-v2.md): 그림판 배치, 생활용품, 경보기, 2개 계산대, 반납 도움.
3. [AI 인터페이스](../../frontend/docs/market-agent-contract.md): 설정·관측·행동·로그 연결의 현재 규격.
4. [NPC 16종 제작 보고서](../design-concepts/2026-09-11-market-people/README.md): 전체 그림, 파일, 시드별 선택과 검증.
5. [초기 환경 변수 보고서](../market-environment-handoff.md), [초기 화면 축소 보고서](../market-visual-refinement.md): 작업의 배경과 이력. 본문의 4분류·96종·계산대 1개·단독 의자 랜덤·옛 테스트 수는 초기 상태이며 현재 값으로 사용하지 않는다.
6. [Expo SDK 57 변경 기록](../../frontend/docs/expo-sdk-57-upgrade.md): 버전과 공식 로그인·실행 방식.

## 9. 노트북 Codex에 그대로 전달할 요청문

> 공식 저장소 thisisdibellob/Oneuldo의 feat/8-시뮬레이션-게임-ui-제작 브랜치에서 기존 작업을 이어가 줘. 먼저 노트북의 git status와 브랜치/remote를 확인하고 기존 변경·커밋을 보존해. checkout이 없으면 해당 브랜치를 새 폴더에 clone하고, 기존 checkout이 깨끗하면 같은 브랜치에서 git pull --ff-only로 최신화해. 이력이 갈라졌으면 임의로 합치거나 reset하지 말고 알려 줘. 받은 코드의 docs/handoff/notebook-handoff-2026-09-11.md를 끝까지 읽어. 코드·이미지·문서는 Git으로 전달하므로 ZIP이나 패치를 적용할 필요 없어. 실제 앱은 frontend이며 SDK 57·마트 5분류 120상품·계산대 2개·NPC 16종·반납 도움까지 유지해야 해. 기존 SDK 54 안내나 4분류 보고서를 최신 구현으로 오해하지 마. 의존성을 설치해 타입 검사·테스트·빌드·smoke를 실행해. 서버를 열라는 요청은 Expo Go 외부 터널과 현재 링크·QR까지 제공하라는 뜻이야. 자세한 새 기능 변경은 다음 요청을 받은 뒤 진행해.

## 10. 유지할 작업 원칙

- 변경 전에 Git 상태·브랜치·원격을 확인한다. 깨끗할 때만 `pull --ff-only`를 한다. 기존 변경을 자동 pull·reset·정리로 없애지 않는다.
- `main`, `release`, `develop`에 직접 커밋·Push하지 않는다. force push와 `git reset --hard`를 사용하지 않는다. 개인 브랜치에서 작업하고 요청받으면 develop 대상으로 PR을 낸다.
- `backend/`, `docs/collaboration.md`, 사용자와 관계없는 파일은 요청 없이 수정하지 않는다. 이전 저장소를 삭제하거나 Archive하지 않는다.
- Expo/React Native를 유지한다. Flutter나 새로운 게임 엔진을 임의로 도입하지 않는다. 모바일·태블릿, 기존 폰트·플로팅 내비게이션·접근성의 모션 감소를 유지한다.
- 이번 마트·상품·NPC 이미지는 사용자가 명시적으로 생성과 교체를 요청한 결과다. 최종 에셋을 보존한다. 이후 디자인 변경도 최신 사용자 요청·기존 스타일을 따른다.
- 비밀값·로그인 파일·`node_modules`·`.expo`·`dist`·개인 편집기 설정을 커밋하지 않는다.
