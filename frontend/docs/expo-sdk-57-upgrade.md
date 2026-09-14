# Expo SDK 57 업그레이드 기록

2026-09-11, 사용자 요청에 따라 `Oneuldo/frontend`를 Expo SDK 54에서 SDK 57로 올렸다. 기존 장보기·요리 게임과 앱 화면을 유지하면서 새 SDK에서 제거되거나 달라진 API와 테스트 환경을 맞췄다.

## 적용 버전과 설치 과정

SDK 54 → 55 → 56 → 57 순서로 각 단계의 `expo install --fix`를 실행했다. 최종 의존성은 `package.json`과 `pnpm-lock.yaml`에 기록되어 있다.

| 항목 | 적용 버전 |
| --- | --- |
| Expo | 57.0.21 |
| React Native | 0.86.3 |
| React / React DOM | 19.2.3 |
| React Native Web | 0.21 계열 |
| TypeScript | 6.0.3 |
| Jest | 29.7.0 |
| jest-expo | 57.0.5 |
| react-test-renderer | 19.2.3 |
| @react-native/jest-preset | 0.86.3 |
| React Native Testing Library | 13.3.3 계열 유지 |
| expo-asset | 57.0.16 |
| expo-splash-screen | 57.0.8 |

Expo 라이브러리도 SDK 57 권장 버전으로 함께 맞췄다. 설치 과정에서 `@expo/dom-webview`에 관한 내부 peer 의존성 정보가 SDK 56 버전을 가리켰기 때문에, SDK 57용 `@expo/dom-webview ~57.0.1`을 명시적 의존성으로 추가하여 버전을 일치시켰다. 앱에 새로운 WebView 화면을 추가한 것은 아니다.

Expo Doctor에서 발견한 `expo-audio`의 필수 peer 누락을 해결하기 위해 `expo-asset ~57.0.16`을 추가했다. 시작 화면 설정 이전에 필요한 `expo-splash-screen ~57.0.8`도 설치했다.

SDK 57은 React Native 0.86을 사용한다. 적용한 버전에는 초기 Hermes 개발 시작 지연 회귀의 수정도 포함된다. [Expo SDK 57 릴리스 노트](https://expo.dev/changelog/sdk-57)

## 소스와 설정 변경

### 온보딩 블러와 유리 효과

SDK 55부터 Android 블러는 배경을 `BlurTargetView`로 지정해야 한다. 온보딩 배경을 이 컴포넌트로 감싸고, 동일한 배경 ref를 로그인 버튼과 입력 필드의 `BlurView`에 전달했다. `experimentalBlurMethod`는 `blurMethod`로 변경했다. 기존 블러 강도, 색상, 화면 간격은 유지했다. 플로팅 내비게이션의 기존 Android 반투명 처리는 유지했다. [Expo BlurView 마이그레이션 안내](https://docs.expo.dev/versions/latest/sdk/blur-view/#android-support)

온보딩과 플로팅 내비게이션은 `GlassView`를 표시하기 전에 `isLiquidGlassAvailable()`와 `isGlassEffectAPIAvailable()`를 함께 확인한다. 런타임에서 유리 효과 API를 지원하지 않으면 기존 대체 표현을 사용한다. [Expo GlassEffect API 가용성 검사](https://docs.expo.dev/versions/latest/sdk/glass-effect/#isglasseffectapiavailable)

### 화면을 채우는 스타일

React Native 0.85에서 제거된 `StyleSheet.absoluteFillObject`를 모든 프론트엔드 소스에서 `StyleSheet.absoluteFill`로 바꿨다. 기존 전체 화면 레이어, 모달 배경, 진열대와 HUD의 위치 지정 의도를 유지하는 치환이다. [React Native 0.85 변경사항](https://reactnative.dev/blog/2026/04/07/react-native-0.85)

### 테스트 환경

Jest 프리셋은 `jest-expo`를 유지했다. React와 테스트 렌더러를 동일한 19.2.3으로 맞추고, SDK 57 프리셋이 요구하는 `@react-native/jest-preset` 0.86.3을 추가했다. [jest-expo SDK 57 의존성](https://github.com/expo/expo/blob/sdk-57/packages/jest-expo/package.json)

`MarketMap.test.tsx`와 `MarketShelfScene.test.tsx`에서는 새 `BackHandler` 콜백 타입에 맞춰 `type`과 `timeStamp`를 가진 뒤로가기 이벤트를 전달한다. 프레임 취소 mock도 빈 ID를 허용하는 새 타입에 맞췄다. 뒤로가기 중복 입력, 모달 닫기, 조이스틱 충돌 등의 기존 검증 의미는 유지했다.

### 오디오와 상태 표시줄

업그레이드 과정에서 추가된 `expo-audio` config plugin은 기존의 화면 내 배경음·효과음 재생 용도에 맞춰 다음과 같이 설정했다.

```json
{
  "microphonePermission": false,
  "recordAudioAndroid": false,
  "enableBackgroundRecording": false,
  "enableBackgroundPlayback": false
}
```

앱의 녹음 기능이나 백그라운드 오디오 기능을 추가하지 않았다. 위 값은 앱의 네이티브 빌드를 생성할 때 적용되는 플러그인 설정이며, 설치된 Expo Go 자체의 권한 설정을 변경하지 않는다. [Expo Audio config plugin](https://docs.expo.dev/versions/v57.0.0/sdk/audio/#configuration-in-app-config)

`expo-status-bar` config plugin도 추가되었다. 현재 사용하는 `<StatusBar style="dark" />`와 게임의 숨김 처리는 유지했다. 제거된 상태 표시줄 배경색·반투명 API는 앱에서 사용하지 않았다. [상태 표시줄 변경 기록](https://github.com/expo/expo/blob/sdk-57/packages/expo-status-bar/CHANGELOG.md)

### 시작 화면

SDK 57 config에서 폐지된 최상위 `splash` 설정은 `expo-splash-screen` config plugin으로 이전했다. 기존 `Logo.png`, 흰 배경, `contain` 표시 방식을 유지하고 `imageWidth`는 기존 로고 폭인 208로 지정했다.

## 개발 환경과 실행 방법

SDK 57의 최소 Node.js 버전은 22.13.x이며, 이번 작업 환경은 Node.js 24.18.1이다. 다른 PC에서도 지원되는 Node.js 버전을 사용해야 한다. [Expo SDK별 지원 버전](https://docs.expo.dev/versions/latest/)

SDK 56부터 올라간 iOS 최소 지원 버전 16.4가 SDK 57에도 적용된다. SDK 57 프로젝트를 열려면 휴대폰의 Expo Go도 해당 SDK를 지원해야 한다. 실제 기기에서 설치된 Expo Go 버전과 실행 여부는 별도로 확인한다. [Expo SDK 56 플랫폼 요구사항](https://expo.dev/changelog/sdk-56#tool-version-bumps)

### 서버 실행 전 Expo 계정 확인

2026-09-03 공식 공지에 따라 최신 iOS Expo Go에서 SDK 57 개발 프로젝트를 열려면 PC의 Expo CLI와 휴대폰의 Expo Go에 같은 Expo 계정으로 로그인해야 한다. 공지 시점의 필수 적용 대상은 최신 iOS Expo Go이며 Android 앱 로그인도 권장된다. [Expo Go 로그인 요구사항 공지](https://expo.dev/changelog/expo-go-57-login)

1. `Oneuldo/frontend`에서 `node node_modules/expo/bin/cli whoami`로 CLI 로그인 계정을 확인한다.
2. `Not logged in`이면 `node node_modules/expo/bin/cli login`이 안내하는 브라우저 로그인 절차를 진행하고, 완료 후 `whoami`로 계정을 다시 확인한다.
3. iPhone Expo Go 홈 화면 오른쪽 위 계정 아이콘에서 로그인하고 PC CLI와 동일한 계정인지 확인한다. 양쪽 로그인 확인 후 서버를 시작하고 현재 QR 또는 Expo Go 직접 링크로 접속한다.

2026-09-11 최초 로그인 문제 확인 시점에는 PC의 `whoami`가 `Not logged in`을 반환했고, 사용자 iPhone에도 Expo CLI와 Expo Go 로그인이 필요하다는 화면이 표시됐다. 이후 공식 브라우저 Google 로그인과 사용자의 휴대폰 본인 확인을 거쳐 PC Expo CLI 로그인을 완료했다. `whoami`에서 사용자 계정명이 반환되고, 외부 iOS manifest의 `extra.expoGo.username`에도 같은 계정명이 전달되는 것을 확인했다. iPhone Expo Go의 동일 계정 로그인과 실제 기기 실행은 사용자 확인이 남아 있다.

### 실행 명령과 접속 안내

아래는 업그레이드 최초 검증 당시 PowerShell에서 사용한 PC 내부 확인용 실행 명령이다.

```powershell
cd C:\Users\PC\Documents\Oneuldo\frontend
pnpm install --frozen-lockfile
node node_modules/expo/bin/cli start --go --localhost --clear --port 8081
```

최초 검증 당시 SDK 57 서버는 `localhost:8081`에서 실행했고 휴대폰 외부 접속용 터널은 비활성 상태였다. `localhost`는 실행한 PC를 가리키므로 이 주소의 QR을 휴대폰으로 스캔해도 PC에 연결되지 않는다. 이 문단은 당시 기록이며 아래의 후속 승인과 실행 규칙을 함께 확인한다.

이후 사용자 승인에 따라 휴대폰의 외부 Expo Go 접속에는 다음 공식 ngrok 터널 명령을 사용한다.

```powershell
node node_modules/expo/bin/cli start --go --tunnel --clear --port 8081
```

이 명령은 Expo CLI의 공식 ngrok 터널을 사용한다. 기존 `pnpm start:tunnel`은 별도의 과거 cloudflared 실행 스크립트이다.

현재 사용자 실행 규칙 (2026-09-11):

- "서버 열어줘", "서버 다시 열어줘"는 휴대폰이 외부 네트워크에서도 접속할 수 있도록 Expo Go 모드와 외부 터널까지 실행하라는 뜻이다. localhost만 열고 완료로 처리하지 않는다.
- 서버 시작 전에 CLI `whoami`와 iPhone Expo Go의 동일 계정 로그인을 확인한다. 로그인 미완료와 서버의 외부 응답 정상 여부를 구분하여 안내한다.
- 실행 후 현재 외부 주소의 Android/iOS manifest와 해당 JavaScript 번들 응답을 검증한다.
- 사용자에게 현재 접속 QR 코드, 클릭 가능한 Expo Go 직접 링크(`exp://` 또는 `exps://`), 클릭 가능한 브라우저 HTTPS 링크를 함께 제공한다. QR을 다른 화면에 띄우기 어려운 휴대폰에서도 Expo Go 직접 링크를 눌러 접속할 수 있게 한다.
- 주소는 실행마다 달라질 수 있으므로 실행 중인 서버에서 확인한 주소로 링크와 QR을 제공한다. 이전 주소나 QR을 재사용하거나 현재 터널 주소를 이 매뉴얼에 고정해 두지 않는다.
- 실행한 서버와 터널은 유지하고 사용자가 종료를 요청하면 닫는다.

최초 터널 시도에서는 자동 승인 검토가 외부 `--tunnel` 실행을 거절했다. 앱 번들과 소스가 외부 터널 제공자를 통해 전달되므로 추가 허용이 필요하다는 이유였고, 그 시점에는 ngrok 연결을 완료하지 않았다.

이후 사용자가 앱 코드(번들)·이미지·폰트를 ngrok 공개 터널(`exp.direct`)로 제공하여 링크 소유자가 외부에서 접속하도록 여는 방식을 명시적으로 승인했다. 승인 후 외부 주소에서 Android/iOS manifest와 각 JavaScript 번들의 HTTP 200 응답을 검증했다. HTTP 200은 외부 전달 경로가 응답한다는 뜻이며, Expo 계정 인증 완료나 실제 휴대폰의 앱 실행 완료를 뜻하지 않는다.

웹 실행은 `pnpm web`, 타입 검사는 `pnpm typecheck`, 테스트는 `pnpm test`, 웹 배포 번들 생성은 `pnpm build:web`이다. 단순히 Expo Go에서 실행하기 위해 `expo prebuild`를 실행할 필요는 없다.

## 검증 상태

2026-09-11 커밋 준비 시 재검증: 타입 검사, 전체 21개 suite·171개 테스트, 웹 빌드, 장보기 smoke(336개 이벤트·2회 제출 후 성공)가 통과했다. 온라인 `expo install --check`에서는 그 사이 공개된 SDK 57 패치 9개를 권장하여 종료 코드 1을 반환했다. 현재 잠금 파일의 검증 버전은 유지했다. 권장 버전은 Expo 57.0.22, expo-asset 57.0.17, expo-audio 57.0.5, expo-blur 57.0.3, expo-font 57.0.4, expo-glass-effect/expo-haptics 57.0.3, expo-linear-gradient 57.0.2, expo-splash-screen 57.0.9다. 아래 표의 의존성 검사 통과는 업그레이드 당시 결과다.

SDK 업그레이드 당시의 검증 기록이다. 외부 터널은 최초 시도와 이후 사용자 승인에 따른 후속 검증을 별도 행으로 구분했다.

| 검증 | 상태 |
| --- | --- |
| TypeScript 타입 검사 | 통과 |
| Jest 전체 테스트 | 19개 suite, 121개 테스트 통과 |
| 수정한 장보기 테스트 재검사 | 14개 테스트 통과 |
| 장보기 headless smoke | 118개 이벤트, 구매 확정 2회 후 성공 |
| 제거된 `StyleSheet.absoluteFillObject` 소스 검색 | 남은 사용처 0개 |
| Expo 공식 의존성 검사 | `expo install --check`: Dependencies are up to date |
| Expo Doctor | 최종 20/21 통과. 기존 로고의 아이콘 규격만 실패 |
| 최종 웹 빌드 | 성공 — 에셋 379개, JavaScript 번들 약 1.6 MB |
| Android JavaScript 번들 | 개발 서버 HTTP 200, 5,701,706 bytes |
| iOS JavaScript 번들 | 개발 서버 HTTP 200, 5,693,966 bytes |
| SDK 57 로컬 서버 | 최초 검증 당시 `localhost:8081`에서 실행. Android/iOS manifest 모두 SDK `57.0.0` 확인 |
| 웹 화면 실행 | SDK 57 번들로 새로고침 후 온보딩 → 홈 → 게임 화면 진입 확인 |
| ngrok 외부 터널 — 최초 시도 | 당시 자동 승인 검토 거절로 비활성 |
| ngrok 외부 터널 — 후속 승인 및 검증 | 사용자가 공개 전송을 명시적으로 승인한 후 외부 Android/iOS manifest와 각 JavaScript 번들 HTTP 200 확인 |
| Expo CLI 로그인 | Google 로그인과 휴대폰 승인 후 완료. `whoami`와 외부 iOS manifest의 `extra.expoGo.username`에서 동일 계정 확인 |
| iPhone Expo Go 로그인 | 휴대폰 앱에서 PC와 동일한 계정으로 로그인했는지 사용자 확인 필요 |
| 실제 iOS·Android 휴대폰 실행 | 미확인 |

첫 Expo Doctor 검사에서는 폐지된 `splash` 키, `expo-asset` peer 누락, 기존 로고의 아이콘 규격 문제를 발견했다. `splash` 설정과 peer 누락은 수정했다. `icon`과 Android `adaptiveIcon.foregroundImage`가 가리키는 기존 로고는 208×76의 비정사각형 이미지이므로 두 규격 경고가 남는다. 이번 SDK 이전에서 브랜드 이미지를 임의로 다시 디자인하지 않았으며, 배포용 아이콘 제작 시 별도로 해결해야 한다.

전체 테스트에는 기존 `App`의 비동기 퀘스트 조회와 관련된 React `act` 경고가 남아 있다. 테스트 실패는 없었으며, 이 경고가 없어졌다고 보고하지 않는다. JavaScript 번들 생성이나 서버 응답 확인은 실제 휴대폰에서의 네이티브 실행 확인과 구분한다.

로컬 웹 홈의 퀘스트 조회는 백엔드 미연결 상태에서 기존 JSON 파싱 오류를 표시한다. 이번 SDK 변경 전에도 관찰된 문제이며, 게임 진입을 막지는 않는다. 백엔드 연결 설정은 이번 작업에서 수정하지 않았다.

작업 범위는 프론트엔드 SDK 호환성이다. `backend/`, `docs/collaboration.md`, 이전 저장소의 `AGENTS.md`는 변경하지 않았다.
