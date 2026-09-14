# 마트 진열대 개선 — 2026-09-08

## 이번 작업 범위

- 기존 마을과 공유하는 이동·카메라·충돌 로직은 유지하고, 마트 배경과 매대 시각 레이어를 교체했다.
- 뒤로 갈수록 좁아지는 방 대신 앞뒤 폭이 같은 평행 투영 바닥으로 수정했다.
- 코너 진입 시 화면 전체가 진열대가 된다. 기존 작은 상품 카드 모달은 제거했다.
- 상품은 실제 UI로 놓이며 선반 배경, 상품명/용량/가격표, 수량 버튼, 고정 장바구니를 분리했다.
- 상품 끌기와 버튼 담기 둘 다 지원한다. 일반 세로 스와이프는 스크롤, 네이티브는 길게 잡아 끌기, 웹 터치는 손잡이로 끌기.
- 180ms 퇴장 완료 후에만 공유 맵 이동을 풀며, 나갔다 다시 들어와도 장바구니와 세계 위치를 유지한다.
- 웹 Escape/Android 뒤로가기, 모션 감소, 작은 320px 폭의 장바구니 줄바꿈을 처리했다.
- 백엔드·행동기록·난이도 API·마을 코드 전면 변경은 이번 범위에 포함하지 않았다. 시작 전 미커밋 작업을 보존했다. 커밋/Push하지 않았다.

## 참고

기존 요구서에 연결된 Pinterest 레퍼런스 3개를 브라우저로 실제 열어 이미지 내용을 확인했다. 이미지를 복제하지 않고 연속된 선반, 얇은 레일, 물품 높이 변화와 가격표 위치를 설계에 적용했다.

- https://www.pinterest.com/pin/936396947547479774/ — 크림 배경과 길게 이어지는 선반.
- https://www.pinterest.com/pin/936396947547479772/ — 개별 카드가 아닌 같은 선반의 반복 진열.
- https://www.pinterest.com/pin/1145462486455634751/ — 음료 높이 변화와 선반 레일 가격표.

## 구현 파일

- frontend/src/components/game/MarketShelfScene.tsx
- frontend/src/components/game/MarketInteriorLayer.tsx
- frontend/src/screens/MarketSimulationScreen.tsx
- frontend/src/screens/GamePrototypeScreen.tsx (마트 레이어 연결만)
- frontend/src/game/gameAssets.ts
- frontend/__tests__/MarketShelfScene.test.tsx
- frontend/__tests__/MarketInteriorLayer.test.tsx

## 생성 에셋과 최종 프롬프트

내장 image_gen 사용. CLI/API 별도 사용 없음. 이번 연속 작업의 생성 호출은 총 8회이며, 최종 사용 에셋은 아래 7개다. 첫 바닥 버전은 원근 수정 전 초안으로 채택하지 않았다. 투명 에셋의 원본 알파를 보존했고, 프로젝트 내부에 복사했다. 생성 원본은 Codex generated_images 폴더에 유지한다.

### shelf_bay_v2.png

저장 경로: `frontend/assets/images/game/market/interior/shelf_bay_v2.png`

```text
Use case: stylized-concept
Asset type: production 2D mobile cozy grocery game EMPTY shelf-bay background, NOT a full screenshot.
Create a horizontal 1536x1024 opaque illustration of ONE empty front-facing supermarket shelf bay. Intended for real interactive product sprites to be placed on top in code.
Composition exact: perfectly frontal, orthographic, no vanishing point, no side walls, no slant. Pale warm ivory back panel fills the top 72% of image, with only tiny subtle vertical panel joins at far edges. One very long shallow shelf surface starts at y=73%, stretches edge-to-edge horizontally. Shelf front rail at y=78%-92% has a soft sage-green narrow strip and warm birch/beige edge. Bottom 8% quiet ivory. No other horizontal shelves. No posts near center. Keep empty background genuinely quiet so product labels readable.
Style: extremely simple cozy hand-drawn 2D game illustration, controlled consistent soft brown thin linework, flat matte colors, minimal one-step shading, no grain/no paper texture, no glow, no vignette, no ambient lighting gradients, no 3D. Inspired by simple cartoon shop shelves with full width shelf rails and empty off-white back, not detailed oil illustration.
NO PRODUCTS, NO FOOD, NO BASKETS, NO LABELS, NO LETTERING, NO NUMBERS, NO UI, no logos, no watermark. No transparent holes. Production reusable background.
```

### market_floor_parallel_v3.png

저장 경로: `frontend/assets/images/game/market/interior/market_floor_parallel_v3.png`

```text
Use case: precise-object-edit
Image 1 is the edit target: our empty shop floor. Preserve its pale ivory/sage palette, simple linework, top blank sign and tiny notice, large quiet tiled floor and bottom centered unlettered mat.
CHANGE ONLY projection: use strictly parallel orthographic projection. The floor width at the back must equal width at the front. ALL side wall lines perfectly vertical, same x coordinate from top to bottom. Remove every inward diagonal sidewall segment near top and bottom. Perimeter must be a simple rectangle. All tile columns exactly equal width all the way from top to bottom; tile rows identical height. Straight horizontal and vertical lines only, no slanted lines anywhere in room or tiles. Back wall is a simple horizontal rectangular band across entire width. Side wall thickness uniform from back to front. Show a little top wall edge as a narrow horizontal strip, not perspective. This is a modular 2D game backdrop, not a perspective room.
No objects added. No shelves, products, characters, text, UI or markers. Keep full portrait composition, opaque image.
```

### shelf_fresh_v2.png

저장 경로: `frontend/assets/images/game/market/interior/shelf_fresh_v2.png`

```text
Use case: stylized-concept. Asset type: isolated runtime 2D cozy shop game fixture sprite on genuinely transparent background, 1536x1024 landscape.
Subject: A small open refrigerated dairy shelf, muted sage green frame, two clear shelf rows. A few simple milk cartons, egg cartons, tofu trays and sausage packs arranged into readable repeated groups, no microdetail.
Art: very light and simple friendly hand-drawn casual game, crisp clean consistent medium-fine muted brown outlines, FLAT pastel color areas with just one simple shadow tone, no gradients, grain, glow, realistic materials, photo light, vignette, gritty details. NOT watercolor. Intended to match simple pale cream and sage shop shelves.
Camera: perfectly symmetrical front with a little top surfaces visible, orthographic top-front RPG sprite, all shelf rails horizontal and parallel, NO diagonal side view, no perspective convergence. Upright fixture occupies center 92%width and 88%height, feet baseline88%height, large clear shapes readable when shrunk to260px. Need a tangible shopfixture, not UI. Transparent only outside fixture silhouette, interiors opaque. No floor scene, no characters, no text, no lettering, no logos, no watermark. Minimal contact shadow containedunderfeet.
```

### shelf_produce_v2.png

저장 경로: `frontend/assets/images/game/market/interior/shelf_produce_v2.png`

```text
Use case: stylized-concept. Asset type: isolated runtime 2D cozy shop game fixture sprite on genuinely transparent background, 1536x1024 landscape.
Subject: A low wooden produce stand made of light birch, three shallow angled crates with a few red apples, yellow bananas, green watermelon and carrots. Simple recognizable fruit silhouettes in modest repeated groups.
Art: very light and simple friendly hand-drawn casual game, crisp clean consistent medium-fine muted brown outlines, FLAT pastel color areas with just one simple shadow tone, no gradients, grain, glow, realistic materials, photo light, vignette, gritty details. NOT watercolor. Intended to match simple pale cream and sage shop shelves.
Camera: perfectly symmetrical front with a little top surfaces visible, orthographic top-front RPG sprite, all shelf rails horizontal and parallel, NO diagonal side view, no perspective convergence. Upright fixture occupies center 92%width and 88%height, feet baseline88%height, large clear shapes readable when shrunk to260px. Need a tangible shopfixture, not UI. Transparent only outside fixture silhouette, interiors opaque. No floor scene, no characters, no text, no lettering, no logos, no watermark. Minimal contact shadow containedunderfeet.
```

### shelf_meal_v2.png

저장 경로: `frontend/assets/images/game/market/interior/shelf_meal_v2.png`

```text
Use case: stylized-concept. Asset type: isolated runtime 2D cozy shop game fixture sprite on genuinely transparent background, 1536x1024 landscape.
Subject: A light ivory grocery gondola with sage green thin shelf rails, two shelves of simple red ramen packets, ochre curry boxes and pale rice tubs arranged in tidy repeated groups. Readable package silhouettes.
Art: very light and simple friendly hand-drawn casual game, crisp clean consistent medium-fine muted brown outlines, FLAT pastel color areas with just one simple shadow tone, no gradients, grain, glow, realistic materials, photo light, vignette, gritty details. NOT watercolor. Intended to match simple pale cream and sage shop shelves.
Camera: perfectly symmetrical front with a little top surfaces visible, orthographic top-front RPG sprite, all shelf rails horizontal and parallel, NO diagonal side view, no perspective convergence. Upright fixture occupies center 92%width and 88%height, feet baseline88%height, large clear shapes readable when shrunk to260px. Need a tangible shopfixture, not UI. Transparent only outside fixture silhouette, interiors opaque. No floor scene, no characters, no text, no lettering, no logos, no watermark. Minimal contact shadow containedunderfeet.
```

### shelf_drink_v2.png

저장 경로: `frontend/assets/images/game/market/interior/shelf_drink_v2.png`

```text
Use case: stylized-concept. Asset type: isolated runtime 2D cozy shop game fixture sprite on genuinely transparent background, 1536x1024 landscape.
Subject: A small open beverage fridge with light sage green frame, two shelves of pale blue water bottles, small juice cartons and coral cans. Bottles and cartons grouped neatly, simple silhouettes.
Art: very light and simple friendly hand-drawn casual game, crisp clean consistent medium-fine muted brown outlines, FLAT pastel color areas with just one simple shadow tone, no gradients, grain, glow, realistic materials, photo light, vignette, gritty details. NOT watercolor. Intended to match simple pale cream and sage shop shelves.
Camera: perfectly symmetrical front with a little top surfaces visible, orthographic top-front RPG sprite, all shelf rails horizontal and parallel, NO diagonal side view, no perspective convergence. Upright fixture occupies center 92%width and 88%height, feet baseline88%height, large clear shapes readable when shrunk to260px. Need a tangible shopfixture, not UI. Transparent only outside fixture silhouette, interiors opaque. No floor scene, no characters, no text, no lettering, no logos, no watermark. Minimal contact shadow containedunderfeet.
```

### checkout_front_v2.png

저장 경로: `frontend/assets/images/game/market/interior/checkout_front_v2.png`

```text
Use case: stylized-concept
Asset type: isolated production 2D cozy grocery game checkout counter sprite, landscape 1536x1024, genuinely transparent background.
Subject: one low simple cream and pale sage green checkout counter, light birch rectangular countertop, small dark sage cash register and card reader on the right, short flat dark checkout belt on the left. No person. No products. No lettering.
Camera: strictly frontal orthographic with a little top surface visible from above. Back edge and front edge of the countertop EXACTLY SAME WIDTH, all horizontal edges parallel, all verticals upright, no slanted side view, no convergence, no vanishing point. Top is a rectangle, not trapezoid or parallelogram. This must fit a parallel-projection top-front 2D game store.
Style: exceptionally simple cozy casual 2D illustration, pale warm ivory, light wood beige, quiet sage green, uniform clean muted-brown outlines. Flat matte colors, only one simple shadow tone. Very light simple surfaces, big shapes readable at 250px. No gradient, no glow, no grain, no paper texture, no bevel shading, no 3D realism.
Composition: counter silhouette center 90% of canvas width, lower baseline 90% height. True alpha transparent outside silhouette including corners, opaque counter interior. No background, no floor, no UI, no watermark. Minimal contained contact shadow.
```

## 검증

- TypeScript 검사 통과.
- `pnpm test --silent`: 13개 테스트 묶음, 63개 테스트 전체 통과.
- `node node_modules/expo/bin/cli export --platform web --output-dir .expo/market-qa/export`: 통과. 실제 앱 진입점 649개 모듈/307개 에셋 번들링 확인.
- `git diff --check`: 통과 (기존 LF/CRLF 안내만 존재).
- 무음 전용 실제 컴포넌트 하네스에서 375px, 320px/568px 높이, 1024px 폭 확인.
- 버튼 담기, 실제 마우스 드래그 담기, 가격/수량 반영, 장바구니 펼치기/빼기, 닫기/재진입 수량 유지, 작은 화면 상품 스크롤 확인.
- 네이티브 기기의 실제 멀티터치/Expo Go 실행은 이번에 하지 않았다. PanResponder·뒤로가기·잠금은 자동 테스트로 확인했다.
- 검증 화면은 오디오 모듈을 불러오지 않으며, 외부 터널을 만들지 않았다.
