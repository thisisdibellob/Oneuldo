# MNN Android 네이티브 라이브러리

이 디렉터리는 오늘도의 Android 온디바이스 LLM 런타임에 사용하는 MNN 네이티브 산출물을 관리한다.

- 프로젝트: `alibaba/MNN`
- 버전: `3.6.1`
- 라이선스: Apache-2.0
- 소스와 라이선스: https://github.com/alibaba/MNN/tree/3.6.1
- 지원 ABI: `arm64-v8a`, `x86_64`

`android/<abi>/`의 바이너리는 `mnn-android.manifest.json`에 기록된 크기와 SHA-256으로 검증된다. 버전이나 빌드 옵션을 변경할 때는 Windows 개발 환경에서 다음 명령으로 두 ABI를 다시 빌드하고 manifest의 산출물 정보를 함께 갱신한다.

```powershell
cd C:\git\Oneuldo\frontend
pnpm mnn:android:build
```

Qwen 모델 본체는 이 디렉터리에 포함하지 않는다. 모델 준비 방법은 `docs/qwen-model-setup.md`를 따른다.
