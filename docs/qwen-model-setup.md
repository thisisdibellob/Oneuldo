# Qwen 온디바이스 모델 설치

오늘도는 `taobao-mnn/Qwen3.5-0.8B-MNN`의 텍스트 추론 파일을 로컬 개발 환경에 내려받아 사용한다. 모델 리비전과 파일 정보는 `frontend/models/qwen3.5-0.8b-mnn.manifest.json`에 고정한다.

## 다운로드

```powershell
cd C:\git\Oneuldo\frontend
pnpm model:qwen:download
```

다운로드된 파일은 `frontend/models/qwen3.5-0.8b-mnn/`에 저장된다. 전체 크기는 약 484MB다.

## 검증

```powershell
cd C:\git\Oneuldo\frontend
pnpm model:qwen:verify
```

검증 명령은 manifest에 기록된 파일 크기와 SHA-256 체크섬을 확인한다.

## Git과 앱 패키징

- 대용량 모델 바이너리는 `.gitignore`로 제외한다.
- manifest, 다운로드 스크립트와 설치 문서는 Git에 포함한다.
- 초기 버전은 텍스트만 사용하므로 `visual.mnn`, `visual.mnn.weight`는 받지 않는다.
- `with-qwen-model` Expo config plugin이 Android prebuild 중 모델을 `android/app/src/main/assets/models/qwen3.5-0.8b-mnn/`에 복사한다.
- EAS Build에서는 `eas-build-post-install` 스크립트가 고정된 모델을 먼저 내려받는다.
- 따라서 생성된 Development Build APK에는 텍스트 모델이 포함되며, 설치 후 별도 다운로드가 필요하지 않다.
- 모델 변경 시 Development Build를 다시 만들어야 한다.
- MNN 런타임에서 모델을 실제로 여는 네이티브 모듈은 Phase 2에서 연결한다.

## 고정된 모델 정보

- 모델: `taobao-mnn/Qwen3.5-0.8B-MNN`
- 리비전: `3208b55b2e3c948016c9d380a697be881a1f12f8`
- 라이선스: Apache-2.0
- 양자화: 4-bit
- 실행 형식: MNN
