# 셀프 계산대 신규 아트 · 2026-09-16

- 용도: 한 계산 구역 안에 세로로 두 대를 배치하는 셀프 계산대. 동일 이미지를 두 번 사용한다.
- 최종 파일: `frontend/assets/images/game/market/interior/self-checkout-v1.png`
- 형식: 1024 × 1536 RGBA PNG, 약 1.72 MB. 모서리 알파 0을 확인했다.
- 제작: 내장 `image_gen` 도구. 기존 `retail-v4/checkout.png`는 그림체·재질·색감 참고로만 사용했다.
- 적용: `MarketKioskFixture`가 바닥 위치와 투명 여백을 보정한다. 화면 안의 실제 스캔·결제 UI는 React Native 컴포넌트다.
- 원본을 그대로 복사했으며, 생성 이후 별도 이미지 편집이나 배경 제거 처리는 하지 않았다.

## 사용한 생성 프롬프트

```text
Use case: stylized-concept. Create a NEW project sprite for a cozy Korean supermarket game. Image 1 is STYLE REFERENCE only, not an edit target. Match its warm cream enamel, muted sage-green panels, warm dark-brown clean hand-drawn outlines, subtle watercolor/pencil grain, softly worn edges. Subject: ONE compact freestanding self-service grocery checkout kiosk with a slightly tilted upright touch screen, a scanner glass below the screen with a small muted red scan light, a small card payment terminal at the side, and a tidy compact bagging shelf. It must visibly read as a SELF CHECKOUT machine, without a long conveyor. View almost front-on with slight view of top surfaces, parallel verticals, symmetrical compact body, no isometric diagonal rotation; readable silhouette when displayed around 90x125 pixels. Composition: whole single machine centered, portrait 2:3 proportions, small even padding. Genuine transparent background and alpha, no floor rectangle, no backdrop, no people, no props outside the machine, no text, no logos, no legible numbers, no decorative confetti. Screen plain soft dusty-blue with a few quiet generic rounded UI blocks. Existing illustration style should feel like a consistent hand-painted game asset, not shiny generic 3D or photorealistic AI art. Return a high-quality transparent PNG.
```
