# 간편 식품·음료 진열대 변형 생성 기록

작성일: 2026-09-11

사용자 요청에 따라 기존 진열대와 같은 모양이며 내부 상품만 다른 두 번째 진열대 이미지를 제작했다. 생성 모드는 imagegen 스킬의 기본 built-in image_gen 편집 모드이며 CLI/API fallback은 사용하지 않았다. 각 원본은 view_image로 먼저 확인했다. 원본 파일은 변경하지 않았다.

## 원본과 최종 에셋

| 종류 | 원본 | 최종 앱 경로 |
| --- | --- | --- |
| 간편 식품 | frontend/assets/images/game/market/interior/shelf_meal_v2.png | frontend/assets/images/game/market/interior/shelf_meal_variant_v1.png |
| 음료 | frontend/assets/images/game/market/interior/shelf_drink_v2.png | frontend/assets/images/game/market/interior/shelf_drink_variant_v1.png |

## 1차 생성 프롬프트

### 간편 식품

```text
Use case: precise-object-edit.
Asset type: transparent PNG game sprite, a second matching instant-food shelf for a Korean grocery training game.
Input image: the attached shelf_meal_v2.png is the edit target. Edit this exact shelf.
Primary request: change ONLY the products inside the two shelf tiers. Preserve the beige metal shelf frame and its sage-green front lips exactly, including two levels, proportions, full outer silhouette, view angle, outlines, feet at floor level, soft hand-drawn watercolor texture and simple illustrated rendering.
Replace the existing red bag ramen, yellow curry boxes and white rice tubs with a varied but orderly display of clearly recognizable cup noodles, spaghetti/pasta boxes, tuna cans, soup cartons and porridge bowls. Put similar products in small tidy groups on both tiers. Package designs use tiny food illustrations, with no legible text or brands.
Composition: isolated one complete shelf, centered, front view slightly looking down, the entire shelf and both feet fully visible, consistent with the original. Keep the frame shape and overall bounding-box ratio of the source.
Background: genuinely transparent RGBA alpha outside the shelf, absolutely no black/white background, no colored glow, no floor, no checkerboard drawn into the image. Erase all the source background haze. Preserve opaque shelf surfaces and product surfaces.
Avoid: text, prices, labels, UI, people, extra furniture, handles, new shelf levels, cropped feet, photorealistic objects. This is the paired second shelf, not a combined picture of two shelves.
```

### 음료

```text
Use case: precise-object-edit.
Asset type: transparent PNG game sprite, a second matching beverage cooler for a Korean grocery training game.
Input image: the attached shelf_drink_v2.png is the edit target. Edit this exact cooler.
Primary request: change ONLY the beverage products within its two interior shelf tiers. Preserve the same sage-green rounded cooler frame precisely, including the rounded top, cream inner surfaces, thin front shelf rails, bottom three ventilation lines, feet, full silhouette and proportions, camera angle, brown outlines and light hand-painted watercolor illustration texture.
Replace the existing blue water bottles, fruit juice cartons and red cans with an orderly variety of green tea bottles, brown ready-to-drink coffee cartons/cans, beige soy milk cartons, cyan sports drink bottles and pale-yellow lemon drink bottles. All beverages are nonalcoholic. Use tiny leaf/coffee bean/soybean/lemon illustrations, without legible lettering. Group matching products tidily in both tiers.
Composition: isolated one complete cooler centered, front view slightly looking down, entire unit and both feet visible, same dimensions and frame shape as source.
Background: genuinely transparent RGBA alpha outside the cooler, absolutely no black or white background, no green glow or blur, no floor, no checkerboard drawn into the image. Erase all source background haze. Shelf and products stay opaque.
Avoid: any alcohol/beer, text, labels, price tags, UI, people, extra objects, new shelf levels, photorealism, cropped edges. This is one second matching cooler, not a combined image of two.
```

## 투명 배경 수정 프롬프트

각 1차 생성 결과를 새 편집 대상으로 사용했다.

```text
Use case: background-extraction. Edit this provided image. The previous generation incorrectly painted a checkerboard as an opaque background; that is a technical defect. Remove every background pixel outside the complete shelf/cooler silhouette and replace it with REAL TRANSPARENCY (actual alpha=0 in a 4-channel RGBA PNG). Do not draw a checkerboard, grid, grey, white, black, vignette, glow or any replacement background. Keep ALL existing shelf/cooler and product pixels visually unchanged: exact same subject, colors, outlines, frame, products, feet, proportions, camera, size and layout. Retain shelf/cooler as an opaque cleanly cut out sprite. Only remove the background. The output must support compositing on an arbitrary game floor. Output one clean transparent PNG cutout at the same 1536 by 1024 landscape composition.
```

## 생성 결과와 검증

기본 생성 저장 폴더: C:/Users/PC/.codex/generated_images/01a08eda-70aa-7ee3-a892-a4134f69bbec/

| 종류 | 단계 | 생성 파일 | 크기 | PNG 컬러타입 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 간편 식품 | 1차 | exec-537a92c5-5ab0-421c-b262-0c19f493df17.png | 1536×1024, 2,131,980 bytes | 2 (RGB) | 진열틀·상품 변경은 적합, alpha 없음 |
| 음료 | 1차 | exec-5a68f3d1-f86e-4fcd-a56f-1e407cbd750e.png | 1536×1024, 1,963,579 bytes | 2 (RGB) | 진열틀·상품 변경은 적합, alpha 없음 |
| 간편 식품 | 배경 수정 | exec-a74cc4c6-73b5-481e-9331-b3ac3e0a8d43.png | 1536×1024, 2,034,406 bytes | 2 (RGB) | alpha 없음, 체커보드가 실제 픽셀로 남음 |
| 음료 | 배경 수정 | exec-64c881a0-7c6e-47c4-867d-a309b512359c.png | 1536×1024, 1,954,432 bytes | 2 (RGB) | alpha 없음, 체커보드가 실제 픽셀로 남음 |

1차 생성 결과는 기존 진열틀의 형태·투시·두 단 구조·다리를 유지했고, 간편 식품은 컵라면·파스타·참치캔·수프·죽, 음료는 녹차·커피·두유·스포츠 음료·레몬 음료로 바뀌었다. 문구·브랜드·가격표·사람·UI·술은 없다. 시각 검사는 생성 결과를 직접 열어 수행했다.

생성 도구가 실제 투명 alpha 대신 체커보드를 RGB 픽셀로 출력했고, 같은 도구의 배경 추출 재시도도 동일하게 실패했다. 따라서 **RGB 생성 파일 자체는 앱 에셋으로 채택하지 않았다.** 최종 파일은 1차 생성의 내부 상품 그림과 기존 원본의 투명 윤곽을 결합해 패키징했다. 이미지 생성에는 위에 기록한 built-in image_gen만 사용했으며 CLI/API 모델로 전환하지 않았다.

## 최종 파일 패키징과 검증

`frontend/scripts/prepare-market-shelf-variant.cjs`로 원본 RGBA를 복사한 뒤, 원본의 alpha가 250 이상이고 주변 6px 범위까지 같은 조건을 만족하는 내부에만 1차 생성 이미지의 RGB를 적용했다. 원본의 전체 alpha, 외곽선 6px, 그림자, 투명 영역 RGB는 그대로 보존했다. 원본과 생성 중간 파일은 덮어쓰지 않았다.

| 최종 파일 | 규격 | 생성 그림이 적용된 내부 픽셀 | alpha=0 픽셀 | 원본 alpha 비교 |
| --- | --- | --- | --- | --- |
| frontend/assets/images/game/market/interior/shelf_meal_variant_v1.png | 1536×1024, PNG 컬러타입 6 (RGBA) | 1,033,921 | 449,492 | 모든 픽셀 일치 |
| frontend/assets/images/game/market/interior/shelf_drink_variant_v1.png | 1536×1024, PNG 컬러타입 6 (RGBA) | 828,507 | 666,188 | 모든 픽셀 일치 |

최종 파일은 위의 프로젝트 경로에 저장되어 앱의 두 번째 진열대 에셋으로 적용했다. 주 작업 에이전트가 최종 이미지를 열어 내부 상품 변경, 동일한 진열틀, 외부 체커보드 부재를 확인했다. 패키징 스크립트는 저장한 PNG를 다시 읽고 원본과 alpha를 픽셀마다 비교하여 투명도를 검증한다.

참고로 원본은 PNG 컬러타입 6(RGBA)이다. PNG 픽셀을 읽어서 alpha 분포를 확인했으며 간편 식품 원본은 alpha=0 449,492픽셀·중간 alpha 1,123,372픽셀, 음료 원본은 alpha=0 666,188픽셀·중간 alpha 906,676픽셀이다. 두 원본 모두 완전 불투명 alpha=255 픽셀은 없다.
