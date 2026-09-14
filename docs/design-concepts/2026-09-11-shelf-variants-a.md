# 냉장 식품·채소 진열대 추가 이미지 제작 기록

- 날짜: 2026-09-11
- 요청: 기존 진열대와 같은 가구에 다른 상품을 진열한 두 번째 이미지. 각 두 이미지는 앱에서 절반 크기로 짝지어 배치한다.
- 모드: 기본 built-in `image_gen` 편집. CLI/API fallback은 사용하지 않았다.
- 편집 입력: `frontend/assets/images/game/market/interior/shelf_fresh_v2.png`, `shelf_produce_v2.png`.
- 원본은 덮어쓰지 않았다.

## 시도와 검사

첫 번째 생성은 냉장 가구와 나무 3칸 진열대의 구조, 시점과 상품 교체를 만족했다. 다만 PNG 색상 유형이 2(RGB)이며 투명을 나타내는 체커보드가 실제 배경으로 들어 있었다. 두 번째 built-in 배경 제거 편집도 유형 2(RGB)로 반환되어 alpha 조건을 충족하지 못했다. 따라서 RGB 생성 원본 자체는 게임 에셋으로 채택하지 않았다. 최종적으로는 1차 생성 이미지의 내부 그림을 기존 에셋의 투명 윤곽과 결합해 패키징한 RGBA 파일을 적용했다.

원본 PNG는 둘 다 1536×1024, 색상 유형 6(RGBA), alpha 범위 0–254이다. fresh 원본의 완전 투명 픽셀은 432,108개, produce 원본은 671,243개다. 초기 생성 이미지 검사와 원본 검사는 PNG IHDR 및 프로젝트에 설치된 pngjs로 수행했다. 최종 패키징과 추가 검증은 아래와 같다.

| 용도 | 1차 생성 파일 | 2차 배경 제거 파일 |
|---|---|---|
| 냉장 식품 | `C:/Users/PC/.codex/generated_images/01a08eda-464c-71d3-b4d1-b96c7493f381/exec-e9b8a8d1-d976-4718-8475-38374e36a320.png` | `C:/Users/PC/.codex/generated_images/01a08eda-464c-71d3-b4d1-b96c7493f381/exec-d5c99e9e-22a7-4459-a6e5-9cd6cbc6731b.png` |
| 채소 | `C:/Users/PC/.codex/generated_images/01a08eda-464c-71d3-b4d1-b96c7493f381/exec-9f80815e-b940-41d7-9a59-2818719a9ec7.png` | `C:/Users/PC/.codex/generated_images/01a08eda-464c-71d3-b4d1-b96c7493f381/exec-c3ca67fb-f204-478d-b108-020d8c8e93a6.png` |

## 실제 사용 프롬프트

### 냉장 식품

Use case: precise-object-edit. Asset type: transparent PNG sprite for a cozy illustrated supermarket training game. Input image 1 is the EDIT TARGET, the existing refrigerated food display. Preserve its entire sage-green refrigerated cabinet, silhouette, width/height proportions, exact frontal/slightly elevated camera angle, two shelf levels, clear front shelf guards, outline thickness, creamy interior, feet and softly shaded watercolor/cartoon materials. CHANGE ONLY the stock on those two shelves: replace the existing plain milk cartons, eggs, tofu and sausage with neatly grouped yogurt cups, packaged cheese, butter packs, chocolate milk cartons and strawberry milk cartons. Use small simple pictures on packaging without text. Keep products inside the existing cabinet and keep the same framing with both feet fully visible. The resulting sprite will stand beside the original as a matching paired display, so its cabinet must look like the same furniture. Background: actual alpha transparency around the cabinet and under the feet, clean sprite cutout, no environment and no backdrop. No black background, no white background, no checkerboard pattern, no floor, no UI, no lettering, no prices, no watermark. Preserve the game art style and furniture geometry; do not redesign the shelf.

### 채소

Use case: precise-object-edit. Asset type: transparent PNG sprite for a cozy illustrated supermarket training game. Input image 1 is the EDIT TARGET, the existing three-bin wooden produce stand. Preserve its entire light natural wood stand exactly: three equal sloped bins, outer rails, dividers, wooden planks, two legs, screw heads, the same width/height proportions, front/slightly elevated camera angle, outline thickness, watercolor/cartoon material and framing. CHANGE ONLY the contents: replace the apples, bananas, watermelon and carrots with vegetables. Left bin: a tidy group of onions and potatoes. Middle bin: cucumbers and broccoli. Right bin: pale green Chinese/Napa cabbages. Keep them recognizably distinct, full but not overflowing above the original silhouette. The resulting sprite will stand beside the original fruit display, so the two pieces of furniture must match precisely. Both feet fully visible and on the same baseline as the original. Background: actual alpha transparency around the stand and beneath the feet, clean isolated sprite cutout, no environment and no backdrop. No black background, no white background, no checkerboard pattern, no floor, no UI, no lettering, no prices, no watermark. Preserve furniture geometry and the original gentle game art style; no extra objects.

### 두 이미지의 배경 제거 재시도

Use case: background-extraction. Edit the supplied sprite image. Remove the gray checkerboard background COMPLETELY. That checkerboard is painted into the picture and MUST NOT remain. Preserve the furniture and every product pixel in the interior unchanged. Replace every area outside the outer furniture outline with true PNG alpha transparency (alpha=0); make the open region beneath the shelf transparent as well. Export a real RGBA PNG cutout with an actual alpha channel, not a flat RGB image. No checkerboard of any kind, no gray or white or black background, no floor, no shadows added, no resizing, no design changes. Only the shelf sprite remains. Transparent output is essential because this sprite is composited over a game floor.

## 최종 처리

`frontend/scripts/prepare-market-shelf-variant.cjs`로 1차 생성 그림의 내부 RGB만 기존 가구의 불투명 영역 안에 복사했다. 원본의 6px 가장자리, 외곽, 그림자 RGB와 모든 픽셀의 alpha를 그대로 보존했다. 따라서 바깥쪽 체커보드는 포함되지 않으며 가구의 기존 투명 윤곽과 부드러운 가장자리를 유지한다. 이미지 생성에는 built-in 도구만 사용했고 CLI 이미지 모델로 전환하지 않았다. 패키징 스크립트는 네트워크 호출이나 앱 의존성 추가 없이 실행된다.

| 최종 파일 | 크기 / 형식 | 생성 내부 적용 픽셀 | 완전 투명 픽셀 | Alpha 검증 |
|---|---|---:|---:|---|
| `frontend/assets/images/game/market/interior/shelf_fresh_variant_v1.png` | 1536×1024 / RGBA PNG | 1,086,169 | 432,108 | 원본과 모든 픽셀 완전 일치 |
| `frontend/assets/images/game/market/interior/shelf_produce_variant_v1.png` | 1536×1024 / RGBA PNG | 854,024 | 671,243 | 원본과 모든 픽셀 완전 일치 |

최종 두 파일은 프로젝트에 저장하고 앱의 짝 진열대 이미지로 연결했다. 최종 이미지의 시각 검사에서 체커보드 배경이 남지 않았음을 확인했다. 원본 `shelf_fresh_v2.png`와 `shelf_produce_v2.png` 및 built-in 생성 원본 파일은 덮어쓰지 않았다.
