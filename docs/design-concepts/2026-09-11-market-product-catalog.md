# 마트 상품 카탈로그 확장 — 2026-09-11

이번 카탈로그는 장보기 환경 실험에서 **상품 부류**와 **정확한 종류**를 별도로 지정하기 위한 데이터다. 학습용 목업 가격이며 실제 판매가나 상품 영양정보를 나타내지 않는다.

## 구성

| 진열대 ID | 기존 상품 | 추가 상품 | 합계 |
|---|---:|---:|---:|
| fresh (냉장 식품) | 6 | 18 | 24 |
| produce (과일·채소) | 6 | 18 | 24 |
| meal (간편 식품) | 6 | 18 | 24 |
| drink (음료) | 6 | 18 | 24 |
| 전체 | 24 | 72 | 96 |

실제 게임에서 이 후보군 중 진열할 상품을 선택한다. 카탈로그 수(카테고리별 24종), 한 게임의 선택 상품 수(카테고리별 9종), 진열 칸 수(4×3, 12칸)는 서로 다른 값이다. 9종을 12칸에 놓을 때 일부 상품을 반복 진열하는 정책은 환경 생성기가 담당한다.

## 데이터 계약

- `frontend/src/game/scenarios.ts`의 `marketProducts`가 전체 카탈로그의 공개 진입점이다. `getMarketProduct(id)`도 그대로 사용한다.
- `frontend/src/game/marketCatalog.ts`에는 추가 상품 72종을 분리했다. 기존 상품의 ID·이름·가격을 보존했다.
- `id`는 정확한 상품을 식별한다. `familyId`는 같은 부류, `familyLabel`은 부류의 표시 이름, `variantLabel`은 세부 종류다.
- 기존 객체와의 호환을 위해 타입의 가족 필드는 선택 사항이지만, 현재 96종에는 전부 값이 있다. 외부 입력은 `familyId ?? id` 방식으로 보완한다.
- 상품의 정답 여부는 그림의 글자를 OCR해서 추론하지 않고 상품 ID 또는 부류 ID로 판정한다. 이름·가격·규격은 화면 텍스트에도 제공해야 한다.
- `frontend/src/game/marketProductImages.ts`의 정적 `require`로 Expo 네이티브 및 웹 번들에 이미지를 포함한다.

## 난이도별 품목 지정 예

| 요구 | 허용 부류/상품 | 구분되는 상품 |
|---|---|---|
| 우유를 사오세요 | `familyId: milk` | 흰 우유·저지방·초코·딸기 |
| 저지방 우유를 사오세요 | `productId: low-fat-milk` | 다른 우유는 해당 목표를 충족하지 않음 |
| 달걀을 사오세요 | `familyId: eggs` | 일반 달걀·해뜰 특란·왕란 |
| 왕란을 사오세요 | `productId: king-eggs` | 일반 달걀·특란과 구분 |
| 콜라를 사오세요 | `familyId: cola` | 일반 콜라·제로 콜라 |
| 제로 콜라를 사오세요 | `productId: zero-cola` | 일반 콜라와 구분 |

서로 다른 가족을 한 목표로 묶지 않도록 했다. 예를 들어 두유는 우유와 별도 `soy-milk` 가족이다. 상품 개수는 포장 단위로 센다. 10개입 달걀 1개는 달걀 10개들이 한 팩을 뜻한다.

## 새 상품 목록

### fresh

| 상품 ID | 이름 | 규격 | 가격(원) | 부류 ID | 세부 종류 |
|---|---|---|---:|---|---|
| `low-fat-milk` | 저지방 우유 | 900mL | 2400 | `milk` | 저지방 |
| `chocolate-milk` | 초코 우유 | 300mL | 1600 | `milk` | 초코 |
| `strawberry-milk` | 딸기 우유 | 300mL | 1600 | `milk` | 딸기 |
| `king-eggs` | 왕란 | 10개입 | 5800 | `eggs` | 왕란 |
| `soft-tofu` | 찌개 두부 | 300g | 1800 | `tofu` | 찌개용 |
| `plain-yogurt` | 플레인 요거트 | 150g | 1500 | `yogurt` | 플레인 |
| `strawberry-yogurt` | 딸기 요거트 | 150g | 1600 | `yogurt` | 딸기 |
| `blueberry-yogurt` | 블루베리 요거트 | 150g | 1700 | `yogurt` | 블루베리 |
| `sliced-cheese` | 슬라이스 치즈 | 10장 | 3400 | `cheese` | 슬라이스 |
| `mozzarella-cheese` | 모짜렐라 치즈 | 200g | 4200 | `cheese` | 모짜렐라 |
| `butter` | 무염 버터 | 200g | 4500 | `butter` | 무염 |
| `salted-butter` | 가염 버터 | 200g | 4500 | `butter` | 가염 |
| `ham` | 슬라이스 햄 | 200g | 3300 | `ham` | 일반 |
| `smoked-ham` | 훈제 햄 | 200g | 3800 | `ham` | 훈제 |
| `chicken-breast` | 닭가슴살 | 100g | 2300 | `chicken-breast` | 일반 |
| `smoked-chicken` | 훈제 닭가슴살 | 100g | 2600 | `chicken-breast` | 훈제 |
| `crab-stick` | 맛살 | 150g | 2200 | `crab-stick` | 일반 |
| `fish-cake` | 사각 어묵 | 300g | 2700 | `fish-cake` | 사각 |

### produce

| 상품 ID | 이름 | 규격 | 가격(원) | 부류 ID | 세부 종류 |
|---|---|---|---:|---|---|
| `green-apple` | 청사과 | 1개 | 1500 | `apple` | 청사과 |
| `cherry-tomato` | 방울토마토 | 500g | 3900 | `tomato` | 방울 |
| `orange` | 오렌지 | 1개 | 1300 | `orange` | 일반 |
| `mandarin` | 귤 | 6개입 | 3500 | `mandarin` | 일반 |
| `lemon` | 레몬 | 1개 | 1000 | `lemon` | 일반 |
| `pear` | 배 | 1개 | 2400 | `pear` | 일반 |
| `peach` | 황도 복숭아 | 1개 | 2200 | `peach` | 황도 |
| `white-peach` | 백도 복숭아 | 1개 | 2200 | `peach` | 백도 |
| `strawberry` | 딸기 | 500g | 6500 | `strawberry` | 일반 |
| `grape` | 포도 | 1송이 | 4900 | `grape` | 자주색 |
| `green-grape` | 청포도 | 1송이 | 5900 | `grape` | 청포도 |
| `kiwi` | 키위 | 4개입 | 4200 | `kiwi` | 일반 |
| `melon` | 멜론 | 1통 | 7900 | `melon` | 일반 |
| `blueberry` | 블루베리 | 125g | 3900 | `blueberry` | 일반 |
| `potato` | 감자 | 1kg | 3200 | `potato` | 일반 |
| `sweet-potato` | 고구마 | 1kg | 4200 | `sweet-potato` | 일반 |
| `broccoli` | 브로콜리 | 1송이 | 2300 | `broccoli` | 일반 |
| `cucumber` | 오이 | 2개입 | 1700 | `cucumber` | 일반 |

### meal

| 상품 ID | 이름 | 규격 | 가격(원) | 부류 ID | 세부 종류 |
|---|---|---|---:|---|---|
| `spicy-curry` | 매운 카레 | 4인분 | 2900 | `curry` | 매운맛 |
| `brown-rice` | 현미 즉석밥 | 210g · 3개입 | 4900 | `rice` | 현미 |
| `kimchi-dumpling` | 김치 만두 | 냉동 · 400g | 6400 | `dumpling` | 김치 |
| `vegetable-dumpling` | 야채 만두 | 냉동 · 400g | 5900 | `dumpling` | 야채 |
| `cup-ramen` | 컵라면 | 1개 | 1500 | `ramen` | 컵 |
| `jjajang-ramen` | 짜장 라면 | 1봉 | 1600 | `ramen` | 짜장 |
| `seaweed-soup` | 미역국 | 500g | 3500 | `soup` | 미역 |
| `beef-soup` | 소고기국 | 500g | 4200 | `soup` | 소고기 |
| `tteokbokki` | 떡볶이 | 2인분 | 3900 | `tteokbokki` | 일반 |
| `rose-tteokbokki` | 로제 떡볶이 | 2인분 | 4400 | `tteokbokki` | 로제 |
| `tuna-can` | 참치 통조림 | 150g | 2400 | `tuna` | 일반 |
| `spicy-tuna` | 고추 참치 | 150g | 2600 | `tuna` | 고추 |
| `pumpkin-porridge` | 단호박죽 | 285g | 3100 | `porridge` | 단호박 |
| `abalone-porridge` | 전복죽 | 285g | 3900 | `porridge` | 전복 |
| `frozen-pizza` | 콤비네이션 피자 | 냉동 · 350g | 6500 | `pizza` | 콤비네이션 |
| `cheese-pizza` | 치즈 피자 | 냉동 · 300g | 5900 | `pizza` | 치즈 |
| `spaghetti` | 토마토 스파게티 | 1인분 | 3500 | `spaghetti` | 토마토 |
| `udon` | 우동 | 1인분 | 2900 | `udon` | 일반 |

### drink

| 상품 ID | 이름 | 규격 | 가격(원) | 부류 ID | 세부 종류 |
|---|---|---|---:|---|---|
| `cola` | 일반 콜라 | 500mL | 2000 | `cola` | 일반 |
| `zero-cola` | 제로 콜라 | 500mL | 2000 | `cola` | 제로 |
| `lemon-soda` | 레몬 탄산음료 | 500mL | 1900 | `soda` | 레몬 |
| `apple-juice` | 사과 주스 | 1L | 3400 | `juice` | 사과 |
| `peach-juice` | 복숭아 주스 | 1L | 3500 | `juice` | 복숭아 |
| `tomato-juice` | 토마토 주스 | 1L | 3500 | `juice` | 토마토 |
| `iced-coffee` | 블랙 커피 | 300mL | 1800 | `coffee` | 블랙 |
| `decaf-coffee` | 디카페인 커피 | 300mL | 2100 | `coffee` | 디카페인 |
| `latte` | 카페라떼 | 300mL | 2000 | `coffee` | 라떼 |
| `soy-milk` | 일반 두유 | 190mL | 1100 | `soy-milk` | 일반 |
| `black-soy-milk` | 검은콩 두유 | 190mL | 1200 | `soy-milk` | 검은콩 |
| `sports-drink` | 이온 음료 | 500mL | 1800 | `sports-drink` | 일반 |
| `zero-sports-drink` | 제로 이온 음료 | 500mL | 1900 | `sports-drink` | 제로 |
| `green-tea` | 녹차 | 500mL | 1400 | `tea` | 녹차 |
| `corn-tea` | 옥수수차 | 500mL | 1500 | `tea` | 옥수수 |
| `hot-chocolate` | 초코 음료 | 250mL | 1700 | `chocolate-drink` | 일반 |
| `grapefruit-sparkling` | 자몽 탄산수 | 500mL | 1600 | `sparkling-water` | 자몽 |
| `plain-sparkling` | 플레인 탄산수 | 500mL | 1500 | `sparkling-water` | 플레인 |

## 이미지 제작 기록

새 이미지 72종은 내장 `image_gen` 도구로 각 상품을 따로 생성했다. 기존 24종 이미지는 유지했다. 생성 결과는 `frontend/assets/images/game/market/products/product_<id>.png`에 저장한다. 실행 중 기본 저장 위치에만 남아 있는 파일을 앱에서 참조하지 않는다.

공통 방향은 기존 상품과 맞는 부드러운 2.5D 일러스트, 짙은 갈색 외곽선, 정면에 가까운 3/4 시점, 투명 배경이다. 비슷한 상품도 포장 색·재료 그림·종류 글자를 구분해서 생성했다. 예를 들어 저지방 우유는 초록색, 초코 우유는 갈색, 딸기 우유는 분홍색 포장이다. 실제 상표를 새로 추가하지 않았다.

최종 프롬프트 목록은 같은 폴더의 `2026-09-11-market-catalog-prompts.json`에서 확인할 수 있다. 카탈로그 자동 검증은 `frontend/__tests__/MarketCatalog.test.ts`에 있으며, 카테고리별 최소 24종·고유 ID·양수 가격·분류 정보·96개 이미지 매핑·실제 PNG 헤더와 최소 해상도·파일별 고유 해시·핵심 변형 가족을 확인한다.

## 모바일 이미지 최적화와 검증 결과

신규 72종은 원본을 보존한 상태에서 앱에 포함할 사본만 최대 512×512px 안에 들어가도록 축소했다. 투명도를 유지하는 RGBA PNG와 PNG 압축 레벨 9를 사용했으며, 그림의 내용·색·글자를 편집하지 않았다. 기존 24종 파일은 변경하지 않았다. 이미지 생성 원본의 디렉터리와 파일명은 프롬프트 JSON의 `sourceRunDirectory`·`sourceArtifacts`에 기록했다.

| 검증 항목 | 결과 |
|---|---|
| 신규 이미지 전체 용량 | 88,184,610 → 22,773,204 bytes |
| 감소율 | 74.18% (65,411,406 bytes 감소) |
| 카탈로그·이미지 매핑 | 96종 전부 연결, 빠진 이미지 없음 |
| 실제 PNG 검증 | 96종 모두 PNG, 투명 픽셀과 불투명 내용 존재 |
| 파일 중복 검증 | SHA-256 해시 96개 전부 고유 |
| 신규 이미지 해상도 | 72종 모두 최대 512px, 최소 256px 이상 |
| 카탈로그 및 기존 시나리오 테스트 | 2개 테스트 묶음, 14개 테스트 통과 |
| 코드 공백 검사 | 담당 기존 파일의 `git diff --check` 통과 |

24종씩 묶은 카테고리별 검토 이미지 4장을 직접 확인했다. 잘린 상품·빈 이미지·배경 사각형이 없고, 우유·요거트·달걀·두부·버터·햄·과일·만두·떡볶이·피자·콜라 등의 세부 종류가 색과 형태 및 포장 글자로 구분된다. 기존 상품 그림과 신규 상품 그림의 세부 표현 밀도는 차이가 있지만, 같은 진열 카드에서 사용하는 데 필요한 실루엣과 투명 배경을 유지한다. 작은 화면에서는 그림 속 글자만으로 판별하게 하지 않고 앱의 상품명·규격 텍스트를 함께 제공한다.

- [냉장 식품 24종 검토 이미지](2026-09-11-market-catalog-qa/fresh.png)
- [과일·채소 24종 검토 이미지](2026-09-11-market-catalog-qa/produce.png)
- [간편 식품 24종 검토 이미지](2026-09-11-market-catalog-qa/meal.png)
- [음료 24종 검토 이미지](2026-09-11-market-catalog-qa/drink.png)
- [파일별 크기·해상도·투명도·해시 검증 기록](2026-09-11-market-catalog-qa/asset-validation.json)

최적화 작업은 `frontend/scripts/optimize-market-catalog-assets.mjs`로 수행했다. 기존에 제공되는 Sharp 도구를 `MARKET_ASSET_SHARP_MODULE`로 지정해 실행했으며, 앱 실행에 필요한 새 패키지는 추가하지 않았다. 이 스크립트는 현재 앱 파일을 입력으로 처리하므로 생성 원본 대비 용량을 다시 측정하려면 먼저 프롬프트 기록의 원본을 복사해서 사용해야 한다.
