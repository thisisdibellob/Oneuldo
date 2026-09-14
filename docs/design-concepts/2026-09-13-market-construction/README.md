# 마트 공사 펜스 이미지 생성 기록

- 사용 도구: 기본 제공 `image_gen` (CLI/API fallback 사용 안 함)
- 게임 에셋: `frontend/assets/images/game/market/interior/construction-fence-v1.png`
- 출력: 1983×793 RGBA PNG, 1,093,548 bytes. alpha 0–255, 완전 투명 픽셀 58.2%.
- 실제 그림 범위: x17–1965, y83–703. 렌더러에서 하단 투명 여백을 보정해 바닥 받침을 충돌 사각형과 정렬.
- 용도: 선택 가능한 입구 공사 조건. 코드가 공사 문구·물리 충돌을 적용하고 PNG는 펜스를 표시.
- 원본은 Codex 생성 이미지 보관 위치에 남겼으며, 게임에서는 저장소 안의 위 에셋만 사용.

## 사용한 최종 프롬프트

Use case: stylized-concept. Asset type: isolated 2D game sprite for an existing gentle illustrated Korean supermarket life-skills game. Create one portable temporary construction safety fence blocking a supermarket doorway. Wide horizontal single fence panel with two stable small feet, a muted warm ochre rounded metal frame, softly drawn sage gray fine wire mesh inside, and one short cream center warning plaque with a simple muted orange triangular caution symbol ONLY (no text). The entire panel, feet and a subtle tiny ground-contact shadow must be visible, isolated on a genuinely transparent alpha background. Frame should be wide and low, roughly 2.5 to 1 overall width to height, centered, filling the canvas closely with minimal empty transparent margin. View is straight-on orthographic 2D, slight view of the tops of the feet to match a top-down frontal cozy hand-drawn shop game, absolutely no skew or trapezoid perspective. Soft pencil-like warm dark olive outlines, clean flat pastel shading, subtle watercolor texture, harmonious cream and sage palette, illustrated game prop with readable simple silhouette. Match a gently drawn shop with beige tiled floor, sage-green shelving and light wood furniture. No people, no background or floor rectangle, no building, no border around image, no logos, no letters, no watermark. Not photorealistic, not glossy 3D, no harsh yellow or black hazard stripes. This fence should clearly mean temporary maintenance while remaining calm and approachable. Deliver a transparent PNG.
