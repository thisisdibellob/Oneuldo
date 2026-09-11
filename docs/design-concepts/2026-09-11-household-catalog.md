# 생활용품 상품 카탈로그 확장

작성일: 2026-09-11

생활용품(`household`) 분류에 24개 상품을 추가하여 기존 96개와 합쳐 총 120개 상품을 제공한다. 기존 상품 ID와 가격은 보존한다. 가격은 훈련용 목업 값이며 실제 판매 가격을 뜻하지 않는다.

일반 연습은 familyId와 familyLabel로 같은 부류를 허용하고, 정확한 상품 연습은 productId로 규격·색·용량·포장 수량을 구별한다. 예를 들어 `건전지`는 AA/AAA와 4개입/8개입 중 어느 것이든 부류 조건을 충족하지만, `AA 건전지 4개입`은 해당 상품만 정확 조건을 충족한다. `충전기`와 `C타입 충전기`, `테이프`와 `두꺼운 테이프`도 같은 방식으로 구분한다. 한 번 담는 수량은 상품 한 포장/한 켤레 단위이며 포장 안의 건전지 개수와 구분한다.

## 상품 목록

| ID | 상품명 | 규격 | 가격(원) | 부류 ID / 이름 | 세부 종류 |
| --- | --- | --- | ---: | --- | --- |
| striped-slippers | 삼선 슬리퍼 | 검정 · 260mm | 3000 | slippers / 슬리퍼 | 검정 260mm |
| striped-slippers-blue | 파랑 삼선 슬리퍼 | 파랑 · 240mm | 3000 | slippers / 슬리퍼 | 파랑 240mm |
| bathroom-slippers | 민트 욕실화 | 민트 · 270mm | 2500 | bathroom-slippers / 욕실화 | 민트 |
| bathroom-slippers-pink | 분홍 욕실화 | 분홍 · 250mm | 2500 | bathroom-slippers / 욕실화 | 분홍 |
| aa-batteries | AA 건전지 4개입 | AA · 4개입 | 2000 | batteries / 건전지 | AA 4개입 |
| aaa-batteries | AAA 건전지 4개입 | AAA · 4개입 | 2000 | batteries / 건전지 | AAA 4개입 |
| aa-batteries-8 | AA 건전지 8개입 | AA · 8개입 | 3500 | batteries / 건전지 | AA 8개입 |
| aaa-batteries-8 | AAA 건전지 8개입 | AAA · 8개입 | 3500 | batteries / 건전지 | AAA 8개입 |
| usb-c-charger | C타입 충전기 | USB-C · 케이블 1m | 5000 | charger / 충전기 | C타입 1m |
| lightning-charger | 8핀 충전기 | 8핀 · 케이블 1m | 5000 | charger / 충전기 | 8핀 1m |
| usb-c-charger-long | C타입 충전기 2m | USB-C · 케이블 2m | 6000 | charger / 충전기 | C타입 2m |
| dish-soap | 레몬 주방 세제 | 500mL · 펌프형 | 2000 | dish-soap / 주방 세제 | 펌프형 500mL |
| dish-soap-refill | 주방 세제 리필 | 1L · 리필형 | 2500 | dish-soap / 주방 세제 | 리필형 1L |
| dish-sponge | 초록 수세미 | 2개입 · 거친 면 | 1000 | dish-sponge / 수세미 | 거친 면 2개입 |
| soft-dish-sponge | 부드러운 수세미 | 2개입 · 흠집 방지 | 1500 | dish-sponge / 수세미 | 흠집 방지 2개입 |
| cleaning-brush | 청소용 솔 | 손잡이형 · 1개 | 1500 | cleaning-brush / 청소용 솔 | 손잡이형 |
| sticky-notes | 노랑 점착 메모지 | 정사각 · 100매 | 1000 | sticky-notes / 점착 메모지 | 노랑 100매 |
| sticky-notes-pastel | 파스텔 점착 메모지 | 3색 · 150매 | 1500 | sticky-notes / 점착 메모지 | 3색 150매 |
| black-ballpoint | 검정 볼펜 | 검정 · 0.7mm · 1개 | 500 | ballpoint / 볼펜 | 검정 0.7mm |
| blue-ballpoint | 파랑 볼펜 | 파랑 · 0.7mm · 1개 | 500 | ballpoint / 볼펜 | 파랑 0.7mm |
| packing-tape | 두꺼운 테이프 | 박스 포장용 · 폭 50mm | 2000 | tape / 테이프 | 포장용 50mm |
| transparent-tape | 투명 테이프 | 사무용 · 폭 18mm | 1000 | tape / 테이프 | 투명 사무용 18mm |
| adhesive-bandages | 상처 밴드 | 일반형 · 20매 | 1000 | bandages / 상처 밴드 | 일반형 20매 |
| waterproof-bandages | 방수 상처 밴드 | 방수형 · 10매 | 2000 | bandages / 상처 밴드 | 방수형 10매 |

## 이미지 생성 방식

imagegen 스킬을 읽고 기존 우유·버터 PNG를 view_image로 확인했다. built-in image_gen 생성 모드를 사용하여 상품 하나당 독립 호출 하나를 수행했다. 네 개씩 병렬 처리했으며 여러 상품을 한 장의 스프라이트 시트로 대체하지 않았다. CLI/API fallback이나 다른 생성 모델로 전환하지 않았다. 그림은 부드러운 수채화 질감, 따뜻한 갈색 외곽선, 파스텔 색, 읽기 쉬운 입체 형태와 실제 투명 RGBA 배경을 요청했다.

생성 원본은 Codex 기본 generated_images 폴더에 보존하고 최종 앱 파일은 `frontend/assets/images/game/market/products/product_<id>.png`에 저장한다. Expo의 native/web 번들에서 각 이미지를 포함하도록 `marketProductImages.ts`에 static require를 추가한다.

## 상품별 생성 지시

모든 호출은 같은 기본 프롬프트에 아래 Primary subject를 결합한다. 별도 참고 이미지를 파라미터로 전달하지 않은 새 이미지 생성이다.

기본 프롬프트 원문:

```text
Use case: product-mockup. Asset type: single isolated household product inventory sprite for a gentle Korean grocery training game. Create exactly ONE product SKU/package, centered on square 1024x1024 canvas with generous 12% clear margin and whole object visible. Style: clean hand-painted 2D game illustration, rounded readable forms, fine warm-brown outlines, soft warm cream highlights, lightly watercolor-textured cel shading, friendly pastel colors, slight three-quarter product view. Match the visual language of illustrated milk cartons and pantry goods, not photographic, not flat vector. Background must be genuinely transparent RGBA alpha outside the isolated product, no visible background, no floor, no shadow outside the object. No people, no shelves, no UI, no watermark, no brands. Use only the short specification labels requested for this item, no extra text. Primary subject:
```

이 기본 프롬프트 뒤에 아래 개별 문장과 마침표를 결합하여 `image_gen.imagegen`의 `prompt`로 전달했다.

- `striped-slippers`: a pair of black rubber slide sandals, each broad strap has exactly three parallel white stripes, size 260mm; no brand mark.
- `striped-slippers-blue`: a pair of blue rubber slide sandals, each broad strap has exactly three parallel white stripes, smaller size 240mm; no brand mark.
- `bathroom-slippers`: a pair of mint-green molded bathroom shower slippers with visible drainage holes in the sole and toe strap.
- `bathroom-slippers-pink`: a pair of pink molded bathroom shower slippers with visible drainage holes in the sole and toe strap.
- `aa-batteries`: one retail blister pack of exactly four standard AA cylindrical batteries, clearly chunky AA size, orange cream backing, large accurate label AA and 4, no brands.
- `aaa-batteries`: one retail blister pack of exactly four slender AAA cylindrical batteries, visibly thinner AAA size, purple cream backing, large accurate label AAA and 4, no brands.
- `aa-batteries-8`: one wide retail blister pack of exactly eight AA cylindrical batteries arranged in two rows of four, orange cream backing, accurate large label AA and 8, no brands.
- `aaa-batteries-8`: one wide retail blister pack of exactly eight slender AAA cylindrical batteries arranged in two rows of four, purple cream backing, accurate large label AAA and 8, no brands.
- `usb-c-charger`: a compact cream retail box with a white two round prong phone power adapter and coiled one-meter white charging cable, connector prominently visibly symmetrical oval USB-C end, blue accents, accurate short label USB-C and 1m.
- `lightning-charger`: a compact cream retail box with a white two round prong phone power adapter and coiled one-meter white charging cable, connector prominently a flat narrow exposed 8-contact Lightning-style tongue, green accents, accurate short label 8-PIN and 1m.
- `usb-c-charger-long`: a compact cream retail box with a white two round prong phone power adapter and a visibly larger coil of two-meter white charging cable, connector prominently oval USB-C end, blue accents, accurate short label USB-C and 2m.
- `dish-soap`: one translucent pale-yellow dishwashing liquid bottle with a cream pump and a simple lemon-and-plate icon label, distinct kitchen detergent packaging, short accurate label 500mL.
- `dish-soap-refill`: one pale-yellow flexible refill pouch of lemon dishwashing liquid with a small cream spout in the upper corner and lemon-and-plate illustration, short accurate label 1L.
- `dish-sponge`: one small clear retail pack of exactly two rectangular yellow kitchen sponges with a thick dark-green abrasive scrubbing layer on top, cream paper band around the middle.
- `soft-dish-sponge`: one small clear retail pack of exactly two soft pastel pink and blue non-scratch kitchen sponges, rounded rectangular shape, smooth fine mesh surface, cream paper band.
- `cleaning-brush`: one household scrub cleaning brush with a curved cream handle, mint-green oval base and dense short white bristles, practical affordable cleaning tool.
- `sticky-notes`: one square pad of yellow self-adhesive sticky notes, a top corner gently peeled up revealing stacked paper edges, a minimal cream retail paper band.
- `sticky-notes-pastel`: one retail set of three small square pads of pastel pink, mint and light-blue self-adhesive sticky notes grouped closely as one package, top sheet corner peeled, cream paper band.
- `black-ballpoint`: one inexpensive transparent-barrel capped ballpoint pen with black cap and black ink tube, diagonal composition, clearly simple cheap office pen, no brands.
- `blue-ballpoint`: one inexpensive transparent-barrel capped ballpoint pen with blue cap and blue ink tube, diagonal composition, clearly simple cheap office pen, no brands.
- `packing-tape`: one wide thick roll of tan packing tape with a brown cardboard core and a short loose peeled end, clearly broad 50mm box-sealing tape, three-quarter view.
- `transparent-tape`: one small narrow clear transparent office adhesive tape roll in a simple pale-blue compact dispenser, white cardboard core, a small clear strip visible at cutting edge.
- `adhesive-bandages`: one small cream-and-orange adhesive bandage retail box with a simple bandage picture, and one clean beige standard adhesive strip in front, short accurate label 20.
- `waterproof-bandages`: one small cream-and-blue waterproof adhesive bandage retail box with a water-drop and bandage picture, and one translucent rounded adhesive strip in front, short accurate label 10.

## 실제 생성 결과 파일

원본 폴더: `C:/Users/PC/.codex/generated_images/01a08eda-70aa-7ee3-a892-a4134f69bbec/`

최종 폴더: `frontend/assets/images/game/market/products/`

아래 원본은 모두 built-in image_gen의 새 이미지 생성 호출 결과이며 원본을 보존했다. 최종 PNG는 별도 복사 후 앱 표시 크기에 맞춰 512×512로 최적화했다.

| 상품 ID | 실제 원본 PNG | 최종 앱 PNG |
| --- | --- | --- |
| striped-slippers | exec-bcac4c1f-3dd7-4f97-a8ef-b0242fcf9ee8.png | product_striped-slippers.png |
| striped-slippers-blue | exec-2b19475d-ddad-4dfe-8bfd-3e04fb0a4e3b.png | product_striped-slippers-blue.png |
| bathroom-slippers | exec-7970f259-b284-4fc6-934e-6be4c8d332dd.png | product_bathroom-slippers.png |
| bathroom-slippers-pink | exec-8fb375ba-9ec9-425c-83fb-70232ea5c40e.png | product_bathroom-slippers-pink.png |
| aa-batteries | exec-cf8321f1-93b6-4e61-ac24-84400781e6c4.png | product_aa-batteries.png |
| aaa-batteries | exec-dda9d825-730c-4b46-b484-42762015183f.png | product_aaa-batteries.png |
| aa-batteries-8 | exec-4a43e421-c92c-4742-97bb-343a3bc61bf3.png | product_aa-batteries-8.png |
| aaa-batteries-8 | exec-4022c598-2d98-4017-8736-2e324b43dc85.png | product_aaa-batteries-8.png |
| usb-c-charger | exec-f6fa2480-c2a9-4618-a3f9-21405eb9de42.png | product_usb-c-charger.png |
| lightning-charger | exec-213636ca-7afc-4657-912f-4a4898fd23d7.png | product_lightning-charger.png |
| usb-c-charger-long | exec-203ec84f-21e8-436b-93be-d6fc76ca133e.png | product_usb-c-charger-long.png |
| dish-soap | exec-f1ee9b47-b6ad-4008-924b-e8fd7792304a.png | product_dish-soap.png |
| dish-soap-refill | exec-54ee76bd-57ce-46c7-bd3c-5896d39dc921.png | product_dish-soap-refill.png |
| dish-sponge | exec-19be903b-0ca5-46a4-ac01-34722c267c14.png | product_dish-sponge.png |
| soft-dish-sponge | exec-2f296a1d-6c14-48db-80f5-3aae3765cc50.png | product_soft-dish-sponge.png |
| cleaning-brush | exec-a482ee01-ad92-44b5-b5bc-ccab04d22119.png | product_cleaning-brush.png |
| sticky-notes | exec-9f2caf3e-0551-4eee-b55d-93946fe5b61b.png | product_sticky-notes.png |
| sticky-notes-pastel | exec-e0a2f784-4a43-4993-b996-62337c47d363.png | product_sticky-notes-pastel.png |
| black-ballpoint | exec-0796d6c8-4265-4446-88ad-cdd8d9f0a4b1.png | product_black-ballpoint.png |
| blue-ballpoint | exec-58c741ff-6a63-4fd0-ab82-40e19a400d03.png | product_blue-ballpoint.png |
| packing-tape | exec-c6641fa1-35bc-4774-9f40-2e3465d6fdff.png | product_packing-tape.png |
| transparent-tape | exec-6c657a8c-7e27-45a5-9122-316381511da0.png | product_transparent-tape.png |
| adhesive-bandages | exec-7eeb7db0-b085-44f6-9bae-cc1b0d904393.png | product_adhesive-bandages.png |
| waterproof-bandages | exec-ddc619a2-11da-46b7-90e0-2fc7e57dc0a3.png | product_waterproof-bandages.png |

## 검증 상태

상품 데이터·정적 이미지 매핑·필수 품목과 family/exact 구분을 확인하는 테스트를 추가했다. 24개 이미지가 모두 독립 생성에 성공했으며 생성 모드를 바꾸거나 대체 이미지를 재사용하지 않았다.

- `pnpm test --silent __tests__/MarketCatalog.test.ts __tests__/MarketScenario.test.ts`: 2개 테스트 모음, 27개 테스트 통과.
- `pnpm typecheck`: 통과.
- 기존 상품 96개와 신규 생활용품 24개의 ID 및 정적 이미지 매핑 총 120개가 일치한다.
- 모든 120개 상품 이미지의 실제 PNG 서명, 최소 256px 해상도, 파일 SHA-256 고유성을 카탈로그 테스트로 확인했다.
- 신규 24개 최종 이미지는 모두 512×512 PNG이며 alpha 채널을 갖는다. 원본에 실제 투명 픽셀(alpha 0~2)이 5% 이상 있고 불투명 상품 픽셀도 5% 이상인지 검사하여 빈 이미지와 배경을 그린 이미지를 차단했다.
- 신규 24개의 최종 SHA-256은 모두 다르며 총 용량은 6,839,380바이트(약 6.52 MiB)다.
- 생성된 24개를 모두 육안 검사했다. 삼선 수, 슬리퍼/욕실화 형태와 색, AA/AAA 규격 및 4개/8개 수량, C타입/8핀 단자, 1m/2m, 세제 펌프/리필, 수세미 종류, 메모지 색, 볼펜 색, 테이프 폭과 용도, 일반/방수 밴드와 포장 수량이 상품 정보와 구분 가능하다. 그림에 체크무늬 배경이나 다른 상품의 재사용은 없다.
- 최종 512px 파일 중 AA/AAA 8개입과 C타입/8핀 충전기는 별도 `view_image`로 다시 확인하여 축소 후에도 숫자·규격·단자 차이가 읽히는 것을 확인했다.

패키징은 `frontend/scripts/prepare-market-layout-assets.cjs`와 설치되어 있던 Sharp 런타임으로 수행했다. 기존 생성 원본을 그대로 남기고 실제 alpha를 유지한 크기 조절 및 PNG 압축만 적용했다. 앱에 새 이미지 처리 의존성은 추가하지 않았다.

로컬 전체 검증 기록은 `frontend/.expo/household-final-qa.json`, 원본/최종 경로 목록은 `frontend/.expo/household-generated-manifest.json`에 있다. `.expo/`는 Git에 포함하지 않으므로 인수인계에 필요한 생성 경로는 위 표에, 검증 결과는 아래 표에 함께 남긴다.

| 상품 ID | 원본 투명 픽셀(alpha 0~2) | 최종 크기(바이트) | 최종 SHA-256 앞 12자리 |
| --- | ---: | ---: | --- |
| striped-slippers | 933418 | 253606 | 755ac1aa5788 |
| striped-slippers-blue | 872117 | 294574 | faca27ecbf60 |
| bathroom-slippers | 810417 | 306706 | a081336ba9c6 |
| bathroom-slippers-pink | 889181 | 272553 | 12ef29575c6d |
| aa-batteries | 815944 | 348519 | f06f93892413 |
| aaa-batteries | 850679 | 315063 | c411474bb529 |
| aa-batteries-8 | 757436 | 366288 | 58e578be5e3a |
| aaa-batteries-8 | 786698 | 342509 | fc63050a6904 |
| usb-c-charger | 702043 | 323611 | 7243869e3d3b |
| lightning-charger | 725949 | 318270 | bb30ddfaea46 |
| usb-c-charger-long | 617525 | 352245 | 3afe92584cb1 |
| dish-soap | 1003202 | 266329 | c9e9e4f554e7 |
| dish-soap-refill | 813779 | 317590 | 0ac5226a2345 |
| dish-sponge | 798094 | 372376 | 01f27b919a2f |
| soft-dish-sponge | 827078 | 332119 | fd6f355820fe |
| cleaning-brush | 791201 | 268154 | 75470dab07bd |
| sticky-notes | 910918 | 234573 | 09ee576e6547 |
| sticky-notes-pastel | 808654 | 275526 | 9971a2feb255 |
| black-ballpoint | 1383164 | 107922 | 9b363faa2b99 |
| blue-ballpoint | 1391973 | 110393 | 168b5e373d2c |
| packing-tape | 881309 | 275684 | 89680e4b2132 |
| transparent-tape | 933365 | 237399 | cf255eb96689 |
| adhesive-bandages | 888127 | 257725 | 6d42050f9faf |
| waterproof-bandages | 896325 | 289646 | ca373149ee8e |
