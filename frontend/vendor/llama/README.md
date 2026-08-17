# llama.cpp Android 런타임

오늘도의 Bllossom GGUF 실행용 네이티브 라이브러리다. `pnpm llama:android:build`가 고정된 llama.cpp `b10455` 소스를 빌드해 `arm64-v8a`, `x86_64` 산출물을 만든다.

GGUF 모델 본체는 APK에 포함하지 않는다. 앱 최초 준비 시 manifest의 URL에서 앱 전용 저장소로 다운로드하고 SHA-256을 검증한다.
