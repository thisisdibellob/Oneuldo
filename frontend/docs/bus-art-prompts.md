# 버스 이동 게임 아트 제작 기록

제작일: 2026-09-29

제작 방식: Codex 내장 `image_gen.imagegen`으로 각 에셋마다 별도 생성 호출(기본 6회, 좌석 자세 보완 1회). CLI/API 대체 경로는 사용하지 않았다. 현재 작업에서 사용자가 이미지 생성을 명시적으로 승인했다.

## 사용 파일

모든 실행용 이미지는 `frontend/assets/images/game/bus/`에 저장하고, `frontend/src/game/busArt.ts`의 `busArt`로 연결한다.

| 매핑 | 실행용 파일 | 크기 | 배경 |
|---|---|---|---|
| busRight | bus-right.png | 1280 × 494 | 투명 |
| busLeft | bus-left.png | 1280 × 508 | 투명 |
| interior | interior.png | 879 × 1790 | 불투명 |
| library | library-exterior.png | 1080 × 562 | 투명 |
| shelter | shelter.png | 768 × 469 | 투명 |
| driver | driver.png | 192 × 424 | 투명 |
| playerSeated | player-seated.png | 197 × 340 | 투명 |

`source/`에는 선택한 원본 7개와 재처리 스크립트, QA 모음 이미지를 보관한다. `asset-manifest.json`에는 원본 크기, 알파 크롭 영역, 실행용 크기와 바이트 수를 기록한다. 원본은 Codex 생성 위치에도 유지한다. 기본 6종은 `source/prepare.cjs`, 앉은 주인공은 `source/prepare-player-seated.cjs` 순서로 처리한다. 두 스크립트 모두 `BUS_ART_SHARP_MODULE` 또는 설치된 `sharp`를 사용하며, 원본 알파 여백 정리와 리사이즈만 수행한다.

## 스타일과 구성

기존 `assets/images/game/library/librarian.png`, `assets/images/game/library/v2/shelf-low.png`, `assets/images/game/environment/village/runtime/env_bench_wood_v1.png`를 열어 선·색·비례를 확인했다. 참고 이미지는 수정 대상이 아니며, 관찰한 스타일을 생성 프롬프트로 기술했다.

기존 캐릭터의 월드 표시 높이 약 106px에 맞추는 따뜻한 치비 게임 그림체, 진한 갈색 윤곽선, 세이지·크림·오크 팔레트를 사용한다. 게임에서 읽어야 할 버스 번호, 행선지, 정류장명, 건물명은 이미지에 넣지 않았다.

- 우향 버스는 아래쪽 인도에 닿는 앞문·뒷문이 보인다.
- 좌향 버스는 별도로 생성했고 아래쪽 면에 승객 문을 넣지 않았다. 반대측 문 위치는 위쪽 가장자리에 보이며 승하차 위치는 위쪽 인도로 연결한다.
- 내부는 580 × 1180 월드 구성에 대응하는 세로 컷어웨이다. 좌측 좌석, 넓은 중앙 통로, 우측 상단 승차문/하단 하차문과 별도 단말기를 구분한다.
- 건물과 정류장에는 게임이 글자를 올릴 빈 간판을 남겼다.
- 도서관은 원본 투명 여백을 제외하면 가로 비율이 약 1.92이므로, 너비 540으로 사용할 때 높이 약 281로 두고 입구/발 위치를 맞춘다.

## 내부 그림의 배치 기준

내부 이미지를 전체 580 × 1180 월드에 맞췄을 때의 대략적 시각 앵커다. 상호작용 도착점은 사물 바로 옆의 걸을 수 있는 통로에 둔다.

| 사물 | x | y |
|---|---:|---:|
| 운전석 | 130 | 215 |
| 앞문 | 492 | 250 |
| 승차 단말기 | 399 | 190 |
| 좌석 1 / 2 / 3 | 119 | 460 / 702 / 927 |
| 손잡이 1 / 2 | 444 | 488 / 789 |
| 하차 단말기 | 406 | 961 |
| 뒷문 | 490 | 1009 |

## 실행용 처리와 검수

Node.js와 Sharp로 생성 알파를 보존하며 투명 에셋의 유효 영역을 크롭하고 축소했다. 기존 도서관 에셋 처리와 같이 alpha > 8의 경계에 4px 여백을 둔다. 배경 제거, 임의의 색 마스킹, 문 위치 반전, 이미지 합성으로 원본 그림을 바꾸지 않는다. 내부의 불투명 배경은 유지한다. QA 모음만 밝은 배경에 합성해 가장자리를 확인한다.

재처리: Sharp를 설치한 환경에서 `node assets/images/game/bus/source/prepare.cjs`. 앱 의존성을 추가하지 않으며 필요하면 `BUS_ART_SHARP_MODULE`에 기존 Sharp 모듈 경로를 지정한다.

검수:
- 6개 생성 결과를 모두 시각적으로 확인했다.
- 투명 컷아웃 5개는 alpha 채널을 확인했고 원본의 네 모서리가 모두 alpha 0이다.
- 밝은 바탕의 `source/qa-contact-sheet.png`에서 불필요한 배경, 글자, 잘린 외곽선이 없는지 확인했다.
- 정류장 생성 미리보기의 어두운 배경 RGB는 alpha 0 영역이며, 실제 합성 이미지에서는 나타나지 않는다.
- 수동으로 글자나 번호를 그림에 합성하지 않았다.

## 생성 프롬프트와 출처

아래는 실제 호출에 사용한 프롬프트 원문이다. 투명 에셋은 `transparent_background: true`, 내부는 `false`로 호출했다.

### bus-right

내장 생성 원본: `exec-4b5015ad-a50c-4add-9d08-f9b2c19dc039.png` → 프로젝트 보관본: `assets/images/game/bus/source/bus-right.png`

```text
Use case: stylized-concept
Asset type: transparent cutout bus sprite for a 2D top-down village game.
Primary request: a compact cozy city bus, cream upper body and sage-green lower body, traveling RIGHT. Side-dominant slightly elevated orthographic view with a small visible roof; front nose at the far RIGHT. Show the NEAR passenger side facing screen bottom with two distinguishable CLOSED folding doors: entry just behind the front/right wheel zone, exit toward the middle-left. Wheels, pale blue windows and round mirrors clear at small scale. Long blank cream route plate above windows, for software-rendered labels. Entire bus fully visible with tidy alpha margin.
Composition: wide horizontal bus silhouette, about 2.4 times as wide as tall. Wheels form the baseline. No driver or passengers needed; no ground platform.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Constraints: actual transparent background; output one single bus only; closed doors clearly distinguishable; never print a bus number or lettering.
```

### bus-left

내장 생성 원본: `exec-85842b86-ac96-433b-ba32-4ebd8e27b09a.png` → 프로젝트 보관본: `assets/images/game/bus/source/bus-left.png`

```text
Use case: stylized-concept
Asset type: transparent cutout bus sprite for a 2D top-down village game.
Primary request: a compact cozy city bus, cream upper body and sage-green lower body, traveling LEFT. This is the opposite-lane version: front nose at the far LEFT, and its passenger boarding side belongs along SCREEN TOP, toward the upper sidewalk. Slightly elevated orthographic view sees the roof and the NEAR non-door side; do NOT put folding passenger doors on the lower/near flank. Give a subtle visible upper far-side entry/exit threshold indication at the top silhouette, suitable for software placing the boarding hotspot just above the bus; two upper edge closed door details are enough. Wheels and pale blue windows clear at small scale. Long blank cream route plate above windows, for software-rendered labels. Entire bus fully visible with tidy alpha margin.
Composition: wide horizontal bus silhouette, about 2.4 times as wide as tall. No ground platform. This is newly drawn geometry, not a horizontal mirror of a door-side rightward sprite.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Constraints: actual transparent background; one single bus only; no passenger doors opening toward screen bottom/road center; no bus numbers or lettering.
```

### interior

내장 생성 원본: `exec-d5c07114-bf17-400b-9e0c-391b7921342c.png` → 프로젝트 보관본: `assets/images/game/bus/source/interior.png`

```text
Use case: stylized-concept
Asset type: vertical interior background for a playable 2D bus training game.
Primary request: an empty cozy city bus interior as a top-down cutaway floor plan, front of bus at image TOP, rear at BOTTOM. Rectangular portrait composition about 1:2 width:height, designed for a 580 x 1180 world. Roof removed, orthographic birds-eye view with shallow visible furniture fronts. Fill the image with the bus interior, no exterior background.
Layout invariants: driver cockpit in UPPER LEFT near x175,y200, steering wheel and empty driver seat, no person. Front passenger entry door on RIGHT wall near x495,y305. One small blank-screen card validator on a post near x445,y380. Three simple muted sage passenger seats along LEFT side centered near x160,y500 then y680 then y840. The CENTRAL WALKABLE AISLE x235..385 stays clear from y300 to y1020: wide pale warm cream floor with no painted signs or furniture. Slim warm yellow handrails on RIGHT near x410,y580 and y760. Rear passenger exit on RIGHT wall near x500,y960, with separate small blank-screen card reader near x430,y955. Upper wall has one plain dark blank information screen. One unlabelled red round stop-bell button on a right handrail, a small detail. Rounded lower rear wall. Keep both doors and stair thresholds legible, with no giant text or arrows. Fixtures are clearly separated, spacious and easy to identify.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Lighting: soft daytime, pale floor, muted sage seating, cream walls, honey-ochre handrails, brown outlines.
Constraints: no people, no text, no bus numbers, no UI, no dashboard labels, no perspective convergence, no center-aisle obstructions. Opaque background allowed for this full interior.
```

### library-exterior

내장 생성 원본: `exec-d763497d-5c49-4a48-ae9b-0d5dd72401be.png` → 프로젝트 보관본: `assets/images/game/bus/source/library-exterior.png`

```text
Use case: stylized-concept
Asset type: transparent standalone building cutout for a cozy 2D village game.
Primary request: a small friendly Korean neighborhood public library, one low story, warm cream walls, muted sage roof fascia with a wide entirely blank cream name sign. Central welcoming glass double entrance, broad front windows with a few recognizable oak bookshelves and muted book spines inside. Small entrance threshold at the bottom center, no stairs that obstruct walking. Entire building fits as a single cutout.
Composition: mostly straight-on front facade with a gently elevated game view; building about 1.45 times as wide as tall, broad readable entrance sized for a 106px chibi character when displayed 540px wide x380px high. Roof top subtly visible, symmetrical quiet massing, no dramatic isometric angle. Very small planter detail against wall acceptable; no ground plane or surrounding trees.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Constraints: genuine transparent background, full building unclipped, no text of any language, no people, no road or sky, no logos. Leave the sign completely blank for software-rendered Korean name.
```

### shelter

내장 생성 원본: `exec-81c23549-cc57-4dbb-a526-d831357a2490.png` → 프로젝트 보관본: `assets/images/game/bus/source/shelter.png`

```text
Use case: stylized-concept
Asset type: transparent bus stop shelter cutout for a 2D village training game.
Primary request: one compact neighborhood bus-stop shelter with a low muted sage roof, cream/brown frame, simple pale blue translucent rear windscreen, a warm oak bench, and one separate tall route post immediately beside the shelter. The route post has an entirely blank pale cream rectangular information panel and blank rounded top plate, with enough surface for software labels; no pictograms or words. Roof, frame, bench and post are distinct and not visually busy.
Composition: straight-on front-facing game prop, slightly elevated view, full object with small transparent padding, horizontal around 1.5:1, bench centered and post on right. No surrounding pavement or street, no people.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Constraints: actual transparent background, no lettering, numbers, icons, route map marks, ground slab, watermark or UI. At small mobile scale the bench and route post must remain recognizable.
```

### driver

내장 생성 원본: `exec-39372351-be99-48f8-9ddb-91b9e2260a0b.png` → 프로젝트 보관본: `assets/images/game/bus/source/driver.png`

```text
Use case: stylized-concept
Asset type: transparent full-body friendly bus driver NPC for the same cozy chibi village game as the reference librarian.
Primary request: one approachable adult Korean bus driver, standing facing straight forward, relaxed arms by sides, gentle small smile, short tidy dark brown hair under a simple muted sage driver cap. Cream shirt, muted blue-sage uniform vest and trousers, dark brown shoes. Small blank rectangular name badge. Friendly large dark eyes, soft cheeks, round big head and compact body; approximately 2.8 heads tall like the existing librarian.
Composition: centered front view full body, head and shoes completely visible, feet on one level, neutral idle pose, narrow portrait silhouette. Will be displayed 106px tall beside the existing player, so use clear simple face and clothing shapes. No steering wheel or bus included.
Style: Warm cozy Korean life-training game art, clean hand-drawn chibi proportions, thick dark chocolate brown outlines, muted sage green, warm cream, honey oak and pale blue glass. Soft simple cel shading, very light material texture, no photorealism, no pixel art, no 3D render. Cohesive with small friendly storybook village furniture and chibi characters shown earlier. No baked words, numbers, logos, symbols pretending to be text, watermark, UI or scene background.
Constraints: actual transparent background with tidy alpha margin, no ground shadow outside character, no text or rank insignia, no additional characters, no child or toy driver; an adult NPC represented in chibi proportions.
```

원본 생성 폴더: `C:/Users/PC/.codex/generated_images/01a0ebe2-b81b-7612-9515-28c54f3d0447/`.

### player-seated — 좌석 자세 보완

원본 주인공 `assets/images/game/characters/player/reference/player-original-turnaround.png`를 먼저 열어 확인하고 캐릭터 정체성 참고로 전달했다. 원본은 사용자 제공 `Group 6854.png`의 보관본이다. 정면 얼굴·머리·회색 후드·가방·바지·운동화를 유지하면서 손을 무릎에 놓고 다리를 아래로 내린 정면 앉기를 요청했다. 원본과 실행용 이미지의 투명 배경·얼굴·손·무릎·발을 확인했고, 밝은 배경 QA 이미지는 `source/qa-player-seated.png`에 저장했다.

내장 생성 원본: `exec-22a88d4b-e329-4f45-89e4-40e314f20850.png` → 프로젝트 보관본: `assets/images/game/bus/source/player-seated.png`.

원본 1149 × 1368에서 알파가 있는 영역에 4px 여백을 더해 685 × 1181로 자르고 높이 340px로 축소했다. 의자와 배경은 포함하지 않는다. 비율 유지 시 표시 높이 85px에서 너비는 약 49px이고, 높이 96px에서는 약 56px이다. 엉덩이가 의자에 닿는 부분은 그림 높이 약 76%, 발끝은 아래쪽에 있으므로 통로 상호작용 지점과 별도로 실제 좌석에 배치한다.

```text
Use case: identity-preserve
Asset type: one transparent seated player sprite for an existing 2D cozy chibi mobile game.
Input image 1: character identity and drawing-style reference, the original five-view turnaround. Use the LEFTMOST FRONT VIEW as the exact identity guide; the other views only clarify hair and the backpack. Produce ONE character only, not a turnaround sheet.
Primary request: redraw this same boy in a clearly SEATED FRONT-FACING pose. Hips resting on an invisible chair, knees bent forward at a right angle, lower legs hanging downward, both shoes visibly pointing forward at the bottom; both small hands relaxed on the lap/thighs. Upright relaxed torso, calm same tiny smile and straight-ahead eyes. Knees and lap must clearly show a sitting pose, not standing with short legs and not sitting cross-legged on the floor.
Preserve exactly: the original chibi head-to-body proportions and rounded large head, tousled dark brown hair silhouette and cowlick, oval dark eyes, peach skin and rosy cheeks, light gray hoodie with the same drawstrings and kangaroo pocket, dark backpack straps and backpack edge behind the torso, blue-gray trousers, white/light gray sneakers with dark outlines. Match original softly textured flat shading, thick warm dark brown hand-drawn outlines and muted colors. Do not redesign the face, clothing, palette or hairstyle.
Composition: full seated body centered, front view, entire head and shoes in frame, compact silhouette suitable for roughly 70px wide by 85px high in the game. Keep the same head size as the standing player; sitting naturally shortens the lower-body silhouette. All lower legs and shoes visible and distinct, small transparent margin.
Scene/backdrop: genuine transparent alpha only. The game already paints the bus seat behind the sprite. Include absolutely no chair, seat, floor, bus, support, ground shadow, scenery, text, icon, watermark or additional person.
Avoid: standing pose, crossed legs, kneeling, oversized feet, extended horizontal legs, hands waving, new accessories, photorealism, 3D rendering, bright saturated palette.
```
# 버스 실내 수정 · 2026-09-29

실제 차체 배치는 현대 일렉시티/뉴 슈퍼 에어로시티 공식 실내 자료를 기준으로 다시 구성했다. 일본 버스는 좌우가 반대이므로 실내 가독성과 좌석 가림 표현만 참고했다. 자세한 출처는 `../../docs/bus-reference-research.md`에 있다.

- 도구: 내장 `image_gen.imagegen`, 투명 배경, 기존 실내와 플레이어 원본을 스타일 참조로 사용.
- 원본: `assets/images/game/bus/source/interior-v2.png` (878 × 1791).
- 게임용: `assets/images/game/bus/v2/interior.png` (580 × 1180, sharp로 크기만 맞춤).
- 배치: 전방은 위쪽, 운전석 왼쪽, 앞문·중문 오른쪽, 승객 좌석은 전방을 향한다. 기사는 원화에 앉은 자세로 포함한다.
- 플레이어: 기존 뒷모습 아틀라스를 유지하며 좌석 등받이를 앞 레이어로 덮어 앉는 방향과 가림을 일치시킨다.

생성 프롬프트:

```text
Use case: stylized-concept
Create a completely rebuilt high-quality game background: one Korean low-floor urban bus interior, roof removed, upright portrait 1:2 aspect. This is a production 2D RPG map, NOT a photograph or UI mockup. Input image 1 is ONLY the warm cozy line/color reference, NOT the faulty seat arrangement to copy. Input image 2 is the character drawing style reference.
CAMERA AND DIRECTION: orthographic elevated rear-to-front cutaway, no vanishing-point distortion. Front windshield is at TOP, rear bench at BOTTOM. All passengers and driver face UP toward the top windshield. Straight parallel cabin sides and straight central vertical aisle. Every passenger seat must show its BACK surface closest to the viewer (lower/bottom edge); the seating cushion projects UP behind that backrest toward the windshield. Do NOT show front-facing armchairs whose cushions project downward! No backward-facing passenger seats.
KOREAN LAYOUT: steering wheel and separated driver cockpit at upper LEFT, front boarding doorway on RIGHT near top 22% height, second wide alighting doorway on RIGHT at 60% height, never at extreme tail. Open central aisle width about35%ofcabin. Seven simple forward-facing passenger chairs: four single chairs along left side at y36%,50%,66%,81%, two on right at y38%,80%, three-person rear bench y93%; leave right middle door landing completely open. Two shallow rear floor steps at78% if needed. Simple matte sage-blue seat cushions, warm cream structural walls, charcoal-blue floor with subtle warm light, pale yellow grab poles beside seats with short hanging straps. Wheel-arch housings sensible. Front and middle right doors have clear pale blue folding-glass panels and yellow threshold edge. Small real-looking card readers at each right door, one red stop request pushbutton on a slim vertical pole at right center. NO repeated extra readers or random icons. Blank small dark destination display ABOVE the windshield; no hanging giant HUD inside picture.
DRIVER: One small adult chibi Korean driver properly SITTING in the upper-left driving seat, shown FROM BEHIND facing windshield, dark tidy hair, pale blue shirt. His upper back, rear of head and forearms on steering wheel visible, hips resting on cushion, lower body concealed correctly by seat; no standing full-body character, no face looking at viewer. Driver head roughly9%ofimagewidth, consistent with provided player. A short clear safety partition separates cockpit from passenger aisle.
ART: clean hand-painted cel-shaded cozy mobile RPG, smooth flat color fields, confident thick warm dark brown outlines, softly rounded corners, restrained sage cream faded ochre palette. Precise geometry, readable furniture silhouettes, limited gentle shading, no grain or muddy watercolor noise. Not childish toy room, not photorealistic, no plastic 3D.
Composition: whole complete interior visible, thin dark exterior shell, tiny transparent outer margin; map full-height fills canvas. Avoid any people other than seated driver, no text/numbers/arrows/logos/watermarks. Keep plenty of clear floor for walking character. Seats' front orientation and right-side mid-cabin exit are top priority.
```
# 운전석 비율 보완

같은 내장 이미지 생성 도구로 기사 크기만 줄였다. 최종 사용본은 `assets/images/game/bus/v3/interior.png` (580 × 1180), 원본은 `assets/images/game/bus/source/interior-v3.png`다. 운전석·문·좌석 배치는 유지한다.

```text
Use case: precise-object-edit. Edit the supplied Korean bus interior game background. Preserve the complete exact canvas, bus shape, all seat positions, colors, perspective, doors, pole positions, floor and transparent outer margin. Change ONLY the driver's figure seated upper-left. The driver head is currently oversized compared to the playable character. Make the driver's head and visible body about 60% of their current width, approximately 47 pixels head width on a 580px-wide bus map. Keep the driver correctly seated facing UP toward windshield, rear of tidy black-haired head visible, pale blue sleeves and forearms reaching the steering wheel. Keep the driving seat and wheel their exact current size and position. Driver hips behind green seat back, small head above seat back, believable driver-to-chair proportions. No standing figure, no face facing the viewer, no change to any other furniture or composition. Maintain warm brown bold line art, clean cozy 2D game style. Full bus remains portrait, transparent outer margins. This is a precise one-object scale correction, not a new bus design.
```
# 버스 실내 가독성 보완 · 2026-10-10

- 도구: 내장 `image_gen.imagegen`, 투명 배경 편집.
- 참조: 기존 `assets/images/game/bus/v4/interior.png` (756 × 2079).
- 생성 원본: `C:/Users/PC/.codex/generated_images/01a08d17-df5b-7493-932e-b7a728252211/exec-8522632e-c2e1-4c74-b55f-98f85c28ea94.png`.
- 사용본: `assets/images/game/bus/v5/interior.png` (756 × 2080). 원본을 복사해 사용한다.
- 목적: 기존 충돌·좌석 위치를 유지하면서 색의 잡음을 줄이고, 좌석 방석·등받이·노란 손잡이를 쉽게 구별하도록 한다. 자리 선택 표시와 도착 정보는 코드로 그린다.

생성 프롬프트:

```text
Use case: precise-object-edit. This is a production 2D cozy life-simulation game bus interior sprite. EDIT THE PROVIDED IMAGE, preserving the exact original vertical composition, object positions, seat arrangement, perspective, external bus silhouette and dimensions/aspect ratio 756:2079. Maintain genuine transparent background outside the rounded bus silhouette. TOP IS FRONT OF BUS. The image is a roofless Korean low-floor city bus cutaway viewed from above with a little depth, tiny seated bus driver at upper left, front door upper right, exit doorway middle right, passenger seats facing toward the top. All current passenger seat cushions, backs and aisle geometry MUST stay where they currently are, because the game collision map is already aligned. Keep driver seated, no new standing people. Change the painting style: crisp, warm medium-thick muted dark brown outlines; clean smooth flat gouache color fills with just one gentle shadow tone; NO grain, noise, muddy mottled texture, photorealistic materials, overly rendered 3D, shine, text, lettering, UI, arrows, circles or labels. Make it feel like a lovingly illustrated cozy console/handheld life-simulation game. Make sage/soft teal passenger seat cushions clearly distinct from their dark muted green backs; light warm ivory bus body and pale warm gray-beige floor; warm yellow gold grab poles clear and readable. Soften overly black shadows. Keep current hands, steering wheel, card terminals and red stop buttons simple and clear. Don't invent extra furnishings or plants. No crop of mirrors or bus front/rear. Clean professionally finished sprite, strong readability at small mobile size.
```

참고 자료와 적용:

- [서울시 2025 버스정보안내단말기 개선](https://news.seoul.go.kr/traffic/archives/514398): 실제 사진의 검은 표시부, 큰 노선 번호, 색으로 구분한 도착 상태, 하단 도착 안내를 게임 안내판에 적용. 분 단위 가짜 시간 대신 실제 게임 상태인 대기·곧 도착·도착을 표시한다.
- [Cozy Grove 공식 가이드](https://www.netflix.com/tudum/articles/cozy-grove-camp-spirit-mobile-game-guide): 공식 게임 화면의 따뜻한 바탕과 단순한 색 면을 참고하고, 자기 속도로 자리와 행동을 선택하도록 구성한다.
- [Spiritfarer 공식 프레스킷](https://thunderlotusgames.com/press-kits/spiritfarer-press-kit/): 공식 화면의 여유 있는 공간과 이동 중 생활감에 착안해 긴 지시문을 줄이고 다음 정류장·하차벨 상태만 짧게 유지한다.
