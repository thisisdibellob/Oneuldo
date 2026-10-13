# 개발 재개와 현재 상태

확인일: 2026-10-13, 기준 코드 `a02ca8a`. 이 문서는 저장소 소스·기존 보고서·현재 대화의 검증 결과를 함께 확인해 작성했다. 이번 인수인계 작업은 문서 정리이며, 게임 기능 추가나 의존성 업데이트를 포함하지 않는다.

## 1. 프로젝트와 작업 범위

`오늘도`는 발달장애인의 생활·직업 자립 연습을 위한 모바일 우선 생활 시뮬레이션이다. 사용자는 교육 과제만 나열한 화면보다, 마을에서 장보기·버스 이동·도서관 업무를 연결해서 플레이하는 코지 게임을 원한다.

| 항목 | 현재 기준 |
| --- | --- |
| 공식 저장소 | `https://github.com/thisisdibellob/Oneuldo` |
| 프론트엔드 | `frontend/`의 Expo React Native 앱 |
| 현재 작업 브랜치 | `feat/8-시뮬레이션-게임-ui-제작` |
| 작업 이슈 | 브랜치의 Issue #8. 실제 PR 연결 상태는 GitHub에서 확인 |
| 팀 통합 브랜치 | `develop`; 개인 브랜치에서 검증 후 PR |
| 이전 저장소 | `VIOLEILLICIT/serious-game-build`; 연구·진단·기존 웹 자료가 남아 있음 |
| 이 PC 실제 경로 | `C:/Users/PC/Documents/Oneuldo/frontend` |
| 이 대화의 이전 시작 경로 | `C:/Users/PC/Documents/serious-game-build`; 실제 개발 경로와 혼동 금지 |

`main`, `release`, `develop`에 직접 커밋/푸시하지 않는다. 사용자 요청 없이 `backend/`, `docs/collaboration.md`, 다른 사람의 9번 AI 브랜치나 기존 저장소를 수정·삭제하지 않는다. `git reset --hard`, force push, 무관한 변경 되돌리기를 사용하지 않는다. 현재 브랜치의 기능은 develop에 병합되었다고 가정하지 않는다.

## 2. 다른 PC에서 받기

### 처음 받는 경우

```powershell
git clone --branch "feat/8-시뮬레이션-게임-ui-제작" https://github.com/thisisdibellob/Oneuldo.git
cd Oneuldo
git status
git branch --show-current
git remote -v
cd frontend
pnpm install --frozen-lockfile
```

### 기존 checkout이 있는 경우

```powershell
git status
git branch --show-current
git remote -v
```

미커밋 변경이 없고 현재 브랜치가 의도한 브랜치일 때 `git pull --ff-only`로 갱신한다. 다른 브랜치이거나 이력이 갈라졌으면 먼저 확인한다. 새 기능 작업은 최신 develop을 기준으로 해당 Issue에 연결된 `feat/...` 브랜치를 만드는 팀 흐름을 따른다. 이번 미병합 구현을 이어가는 작업은 위 8번 브랜치를 사용한다.

`node_modules/`, `.expo/`, `dist/`, 환경 파일, 로그인 세션, 개발 서버 프로세스는 Git으로 전달되지 않는다. `frontend/assets/`의 추적된 게임 이미지·글꼴은 전달되므로 이전 PC의 Downloads/Temp 폴더가 없어도 실행용 에셋을 사용할 수 있다. 이미지 제작 스크립트의 로컬 원본/도구 경로는 별도 확인한다.

## 3. 설치·실행 기준

[package.json](../../frontend/package.json)과 [pnpm-lock.yaml](../../frontend/pnpm-lock.yaml)이 실제 기준이다.

| 구성 | 확인한 버전 |
| --- | --- |
| Expo | `~57.0.21` |
| React Native | `0.86.3` |
| React / React DOM | `19.2.3` |
| React Native Web | `~0.21.0` |
| TypeScript | `~6.0.3` |
| Jest / jest-expo | `29.7.0` / `~57.0.5` |

기존 [SDK 57 전환 기록](../../frontend/docs/expo-sdk-57-upgrade.md)에 Node 22.13 이상 기준과 검증 환경이 기록돼 있다. SDK 54·RN 0.81이라고 적힌 초기 인수인계는 과거 상태다. 새 PC 설치를 위해 SDK를 임의로 바꾸지 않는다.

### Expo Go 서버

사용자가 “서버 열어줘”라고 하면 외부 네트워크에서도 열 수 있는 Expo Go 터널까지 실행한다.

```powershell
cd frontend
pnpm exec expo whoami
# 로그인이 필요할 때 사용자가 공식 브라우저에서 직접 진행
pnpm exec expo login --browser
pnpm exec expo start --go --tunnel --port 8081
```

- `login`은 로그인되어 있으면 생략한다. 비밀번호를 대화로 받거나 PC의 인증 파일을 다른 기기로 복사하지 않는다.
- iPhone Expo Go와 PC CLI의 동일 계정 로그인 요구사항 및 확인 방법은 [SDK 기록](../../frontend/docs/expo-sdk-57-upgrade.md)을 따른다.
- 새 실행의 실제 터널 주소로 외부 manifest와 `extra.expoGo.username`을 확인한다. HTTP 200과 휴대폰의 실제 실행 성공은 별도다.
- 현재 주소로 만든 QR, 클릭 가능한 `exp://` 또는 `exps://` Expo Go 링크, 별도의 `https://` 브라우저 링크를 모두 제공한다. 이전 주소나 localhost만 전달하지 않는다.
- 서버는 사용자가 종료를 요청할 때까지 유지한다. Windows 백그라운드 실행은 `Start-Process -WindowStyle Hidden`을 사용하며 무관한 프로세스를 종료하지 않는다.
- `pnpm start:tunnel`은 [기존 cloudflared 도구](../../frontend/scripts/start-expo-tunnel.mjs)다. 위 공식 Expo 터널 명령과 다르다.

### 개발용 웹 진입점

| URL 매개변수 | 진입 위치 |
| --- | --- |
| `?busPreview=1&muteAudio=1` | 마을 동쪽 정류장 근처에서 버스 흐름 확인 |
| `?libraryPreview=1&muteAudio=1` | 같은 게임 셸의 도서관에서 확인 |
| `?marketLab=1&muteAudio=1` | 마트 단독 검증 화면 |

이 플래그는 [App.tsx](../../frontend/App.tsx)의 **개발 모드 웹 전용**이다. 출시용 export나 Expo Go에서 URL만 붙이면 동일하게 진입한다고 안내하지 않는다. 실제 사용자 흐름은 앱의 게임/퀘스트 메뉴를 통해 확인한다. `muteAudio`로 시험한 화면은 음성·효과음 품질 검증 근거가 아니다.

## 4. 앱 전체의 현재 연결 상태

| 영역 | 소스로 확인한 상태 | 이어서 볼 파일 |
| --- | --- | --- |
| 시작/폰트 | 온보딩용 글꼴 우선 로드 후 나머지 로드; 준비/오류/재시도 화면 | [App](../../frontend/App.tsx), [useAppFonts](../../frontend/src/useAppFonts.ts) |
| 온보딩/로그인 | Google·Kakao·아이디 UI가 앱 진입 콜백을 호출하는 목업. 실제 인증/토큰 저장 확인 없음 | [OnboardingScreen](../../frontend/src/screens/OnboardingScreen.tsx) |
| 홈 퀘스트 | `EXPO_PUBLIC_API_URL`의 목록/상세 API를 호출하고 로딩·실패 처리 | [quest API](../../frontend/src/api/quest.ts), [HomeScreen](../../frontend/src/screens/HomeScreen.tsx) |
| 앱 전환 | 홈/퀘스트/게임/AI/사용자 탭과 플로팅 내비게이션; 게임은 GamePrototypeScreen으로 진입 | [AppShell](../../frontend/src/screens/AppShell.tsx) |
| 퀘스트 탭 | 달력/수치 일부 목업. 버스·장보기·도서관 외출·심부름은 게임 상태와 연결 | [QuestScreen](../../frontend/src/screens/QuestScreen.tsx) |
| 기존 단계형 연습 | 상세 퀘스트 제목을 받지만 문항은 로컬 questions 배열. 새 버스 게임과 별도 구현 | [QuestPracticeScreen](../../frontend/src/screens/QuestPracticeScreen.tsx) |
| AI 친구 탭 | 구름이/루나 선택, 키보드 대응, 약 0.5초 후 고정 답변. 실제 LLM 호출 없음 | [AiScreen](../../frontend/src/screens/AiScreen.tsx) |
| 사용자 탭 | 캐릭터와 관성/스프링 앱 서랍 UI. 나열된 앱 전체가 서비스 연동 완료된 것은 아님 | [ProfileScreen](../../frontend/src/screens/ProfileScreen.tsx) |
| 마을/게임 | 한 게임 셸 안에서 생활 과제를 연결. 규칙과 결과는 로컬 상태 엔진 | [GamePrototypeScreen](../../frontend/src/screens/GamePrototypeScreen.tsx), [기능 인수인계](world-market-shared-2026-10-13.md) |

홈 API 경로는 `GET /api/quest`, `GET /api/quest/{uuid}`다. `.env.local`의 값을 복사해 문서나 커밋에 넣지 말고 담당자에게 실행 대상 API 주소를 확인한다. `EXPO_PUBLIC_*` 값은 클라이언트에 노출되므로 비밀 API 키를 넣지 않는다. 위 호출 코드의 존재는 현재 서버·인증·DB 연결 성공을 뜻하지 않는다.

학교 AI 서버 연결 진단과 전문가/플레이어 페르소나 연구는 별도 이력이다. 현재 AI 친구 탭이나 게임 NPC가 그 서버에 연결됐다고 적지 않는다. [연구·진단 근거](activity-evidence-2026-10-13.md)를 함께 읽는다.

## 5. 유지할 사용자 결정

- 여러 교육 미니앱을 따로 나열하기보다 **마을에서 이어지는 하나의 생활 게임**으로 만든다. 퀘스트 메뉴와 게임 내 수첩에서도 현재 부탁을 확인하고 이어간다.
- 모바일 우선, 큰 글씨·간결한 선택·부드러운 전환을 유지한다. 의미 없는 응원/보조 문구와 과한 아웃라인을 늘리지 않는다.
- 게임은 기존 플레이어 레퍼런스와 어울리는 따뜻한 그림체를 유지한다. 사용자에게 이번 게임 에셋의 이미지 생성·교체 승인을 받았으나, 모든 앱 화면의 디자인을 자유롭게 변경하는 승인으로 확대하지 않는다.
- 이동/달리기/상호작용 UI는 공통 컴포넌트를 재사용한다. 조이스틱 모드에서 물체를 눌러 원치 않게 자동 이동하지 않게 한다. 버스 자리 선택의 의도적인 이동과 구분한다.
- 대기 캐릭터는 앞·뒤 정면 idle 애니메이션을 쓴다. 방향별 스프라이트와 프레임 정렬·카메라 동기화 수정이 되돌아가지 않도록 한다.
- 폰의 화면별 크기를 통일하고 모바일에서 너무 길지 않게 유지한다. 아이콘 모서리는 실제 기기에서 확인한다.
- 게임 결과 저장, 활동 앨범, 현재 실행 중 이어하기, 앱 종료 후 중간 저장을 서로 구분한다. 사용자에게 기존보다 넓은 영구 저장 기능을 약속하지 않는다.
- 모션 감소 접근성 설정, 모바일 터치, 기존 글꼴·플로팅 내비게이션을 유지한다.
- 기존 Figma 기반 앱 디자인을 바꿀 때는 최신 사용자 지시·실제 디자인을 확인한다. 게임에 대한 반복 피드백은 각 기능 인수인계에 보존한다.

현재 글꼴은 [theme.ts](../../frontend/src/theme.ts)의 토큰을 따른다. Pretendard, LaundryGothic, KyoboHandwriting 외에 게임용 Griun-InaDoongdoong, Cafe24 Ssurround/Air가 포함돼 있다. [native 글꼴 매핑](../../frontend/src/appFontAssets.ts), [웹 매핑](../../frontend/src/appFontAssets.web.ts), [웹 폰트 제작 기록](../../frontend/assets/fonts/web/README.md)을 확인한다. 과거 추천한 폰트 전부를 설치/적용했다고 기록하지 않는다.

## 6. 최신 검증 기록

**아래는 2026-10-13 이 대화에서 코드 커밋 `a02ca8a` 전후에 실행한 결과다. 인수인계 문서 작성 때 기능 검사를 새로 반복한 결과가 아니다.**

| 검사 | 확인한 결과 |
| --- | --- |
| `pnpm typecheck` | 통과 |
| `pnpm test` | 88개 suite, **982개 test 통과**, 약 295초 |
| `pnpm build:web` | 성공, Expo 웹 export 생성 |
| Git diff 검사 | 커밋 전 끝 빈 줄 수정 후 통과 |
| 버스 실제 브라우저 플레이 | PC 및 390×844 화면에서 탑승·착석·출발·하차벨·정류장 도착 확인. 여러 도로 반복 후에도 이동하고 정차 후 변위 고정 |
| 외부 Expo manifest | 당시 실제 터널의 HTTP 200 및 로그인 username 확인 |
| iOS/Android 실기기 | 이번 최종 도로 변경은 직접 검증하지 않음 |

테스트에 일부 React `act(...)` 및 `pointerEvents` 사용 경고가 출력됐다. 테스트 실패와 구분하되 경고가 없었다고 보고하지 않는다. 실행 로그는 이 PC 대화/로컬 QA 폴더에 있어 Git에서 자동 복원되지 않는다. 최신 버스 화면 2장은 아래에 함께 보관했다. 문서의 숫자는 당시 실행 결과이며 새 코드의 결과로 재사용하지 않는다.

- [PC 버스 도로 캡처](images/bus-road-2026-10-13-desktop.jpg)
- [390×844 브라우저 버스 도로 캡처](images/bus-road-2026-10-13-mobile.jpg)

두 정지 화면은 배치/외형 증거다. 반복 주행·정차 확인은 대화의 실제 플레이 및 변위 관측 결과이며, JPG만으로 애니메이션이나 Expo Go 실기기 성능을 입증하지 않는다.

`pnpm exec expo install --check`는 당시 다음 11개 패치 버전 차이로 종료 코드 1이었다. **검증한 잠금 파일을 유지했으며 이번에 업데이트하지 않았다.**

| 패키지 | 설치된 버전 → 검사 당시 권장 |
| --- | --- |
| @expo/metro-runtime | 57.0.15 → ~57.0.16 |
| expo | 57.0.21 → ~57.0.28 |
| expo-asset | 57.0.16 → ~57.0.19 |
| expo-audio | 57.0.4 → ~57.0.5 |
| expo-blur | 57.0.2 → ~57.0.3 |
| expo-font | 57.0.3 → ~57.0.4 |
| expo-glass-effect | 57.0.2 → ~57.0.4 |
| expo-haptics | 57.0.2 → ~57.0.3 |
| expo-linear-gradient | 57.0.1 → ~57.0.2 |
| expo-splash-screen | 57.0.8 → ~57.0.10 |
| jest-expo | 57.0.5 → ~57.0.6 |

새 PC에서 코드를 바꾸면 타입 검사·관련 테스트를 실행하고 범위에 따라 전체 테스트/웹 빌드를 실행한다. 문서만 바꾸면 Markdown 내용·파일 링크·Git diff를 검사한다.

## 7. 남은 일과 인수인계 한계

| 항목 | 다음 담당자가 할 일 |
| --- | --- |
| 실제 기기 검증 | iOS/Android Expo Go에서 스프라이트 흔들림, 맵 이동 부드러움, 키오스크 드래그, 폰 아이콘, 버스 주행/음성/정차를 확인 |
| 저장 범위 | localStorage/메모리 대체 여부를 확인. 앱 종료·기기 변경 후 진행 복원을 구현 완료로 취급하지 않기 |
| 서버 기능 | 홈 퀘스트 API 실제 연결과 목업 로그인/AI 탭을 구분. 백엔드 담당자와 별도 합의 후 연결 |
| 최신 SDK 패치 | 잠금 파일을 유지해 재현한 뒤 별도 작업으로 업데이트/회귀 검사 |
| UI 목업 | 달력·경험치·사용자 메뉴 등의 실제 데이터 연동은 각 화면별로 확인 |
| 학습 효과 | 기능 테스트·게임 규칙 통과를 발달장애인 대상 효과 입증으로 서술하지 않기. 연구 해석과 사용자 평가를 구분 |
| 날짜와 기여자 | 통합 커밋 날짜만으로 활동 주차·작업 시간·사용자 개인 기여를 확정하지 않기 |
| 연구·원본 | [연구자료 전달 범위](activity-evidence-2026-10-13.md)를 확인. 원본 이미지/원문 수집자료 일부는 이전 PC에만 있음 |

출시 준비 완료, 실제 참여자 평가 완료, 전체 게임 AI 연동 완료로 기록할 근거는 없다. 다음 작업자는 기능별 문서의 미완성·검증 필요 항목과 실제 코드를 확인하고 필요한 범위를 사용자 요청에 맞춰 진행한다.
