# Expo Development Build 가이드

오늘도 앱은 MNN과 같은 네이티브 라이브러리를 사용할 수 있도록 Expo Go 대신 Development Build를 기본 모바일 개발 환경으로 사용한다.

## Expo Go와의 차이

- `pnpm start`: 오늘도 전용 Development Client를 대상으로 Metro를 실행한다.
- `pnpm start:go`: 네이티브 기능이 필요 없는 화면을 Expo Go에서 임시로 확인한다.
- MNN 등 C++·Kotlin·Swift 코드가 필요한 기능은 Development Client에서만 동작한다.

## 최초 Android 개발 빌드

### EAS 클라우드에서 빌드

Android Studio와 Android SDK가 없는 Windows 환경에서는 EAS Build를 사용할 수 있다.

```powershell
cd C:\git\Oneuldo\frontend
pnpm dlx eas-cli login
pnpm dlx eas-cli build --platform android --profile development
```

최초 실행 시 Expo 프로젝트 연결 여부를 묻는 메시지가 나오면 안내에 따라 새 프로젝트를 생성하거나 기존 프로젝트에 연결한다.

빌드가 끝나면 제공되는 링크 또는 QR 코드로 Development Client APK를 Android 기기에 설치한다.

### Android SDK로 로컬 빌드

Android Studio와 SDK를 설치한 환경에서는 다음 명령으로 USB 기기 또는 에뮬레이터에 직접 설치할 수 있다.

```powershell
cd C:\git\Oneuldo\frontend
pnpm android
```

연결된 실제 기기를 선택하려면 다음 명령을 사용한다.

```powershell
pnpm android:device
```

## 평소 개발 서버 실행

Development Client가 기기에 설치된 이후에는 네이티브 코드가 바뀌지 않는 한 앱을 다시 빌드할 필요가 없다.

```powershell
cd C:\git\Oneuldo\frontend
pnpm start
```

개발 서버의 QR 코드를 설치된 오늘도 Development Client로 스캔한다.

## 다시 빌드해야 하는 경우

다음 변경이 있으면 Development Client를 다시 빌드한다.

- MNN과 같은 네이티브 라이브러리 추가 또는 업데이트
- Kotlin·Java·Swift·Objective-C·C++ 코드 변경
- Expo config plugin 추가 또는 변경
- `app.json`의 네이티브 설정 변경
- Expo SDK 또는 React Native 버전 변경

TypeScript, React 컴포넌트, 스타일, 이미지 등 JavaScript 번들 영역만 수정한 경우에는 Metro 재실행 또는 Fast Refresh만으로 확인할 수 있다.

## iOS 빌드

Windows에서는 iOS 앱을 로컬 컴파일할 수 없다. Mac에서 `pnpm ios`를 실행하거나 EAS Build를 사용한다.

```powershell
pnpm dlx eas-cli build --platform ios --profile development
```

iPhone 기기에 설치하려면 Apple Developer 계정 및 기기 등록이 필요할 수 있다.
