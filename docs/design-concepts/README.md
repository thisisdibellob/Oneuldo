# 아트·캐릭터·폰트 제작 기록

목차 정리일: **2026-10-17**. [전체 문서 안내](../document-index.md) · [기능 문서](../../frontend/docs/README.md)

이 폴더에는 시안뿐 아니라 실제 생성·적용한 이미지의 제작 기록도 있다. 아래 링크는 원본과 변경 이유를 찾기 위한 것이며, 모든 버전의 그림이 현재 화면에서 사용된다는 뜻은 아니다. 실제 사용 파일·크기·발 기준점은 현재 코드 매핑과 기능 문서에서 확인한다.

## 1. 마트 집기·상품·인물

| 제작 기록 | 담긴 내용 |
| --- | --- |
| [초기 마트·진열대](2026-09-08-market-shelves.md) | 초기 집기와 진열대 UI 제작·적용 |
| [정면 집기](2026-09-11-market-orthographic-assets.md) | 진열대·계산대·엘리베이터·ATM, 투명 처리와 원본 |
| [상품 카탈로그](2026-09-11-market-product-catalog.md) | 기본 분류의 상품 ID·family·규격과 추가 제작 기록 |
| [생활용품 카탈로그](2026-09-11-household-catalog.md) | 생활용품 24종의 ID·포장 단위·목업 가격·원본 |
| [진열대 변형 A](2026-09-11-shelf-variants-a.md) | 냉장식품·채소 진열대 |
| [진열대 변형 B](2026-09-11-shelf-variants-b.md) | 간편식품·음료 진열대 |
| [직원·손님](2026-09-11-market-people/README.md) | 인물 외형 명세, 원본·실행 이미지 위치 |
| [공사 펜스](2026-09-13-market-construction/README.md) | 생성 프롬프트·투명 여백·바닥 정렬 |
| [셀프 계산대](2026-09-16-self-checkout.md) | 집기 그림 제작. 스캔 화면의 UI 명세와 구분 |

상품 개수·성인 캐릭터 높이·매장 배치와 같은 수치는 제작 당시 값이다. 현재 장보기 동작은 [공통 인수인계](../handoff/world-market-shared-2026-10-13.md), [계산 기능](../market-checkout-review-2026-09-24.md), [배치 편집](../../frontend/docs/market-tilemap-editor.md)을 먼저 읽는다.

### 제작·검수 JSON

| 자료 | 용도 |
| --- | --- |
| [상품 프롬프트](2026-09-11-market-catalog-prompts.json) | 상품별 생성 원본과 수정 이력 |
| [인물 프롬프트](2026-09-11-market-people-prompts.json) | 직원·손님 외형과 공통 그림체 |
| [인물 생성 목록](2026-09-11-market-people/generation-manifest.json), [검수 결과](2026-09-11-market-people/asset-qa.json) | 원본 경로·크기·투명도·해시 |
| [상품 검수 결과](2026-09-11-market-catalog-qa/asset-validation.json) | 당시 상품 이미지 최적화 결과 |
| [일반 선반](2026-09-13-market-retail/gondola-manifest.json), [과일 선반](2026-09-13-market-retail/produce-empty-manifest.json), [냉장 선반](2026-09-13-market-retail/fridge-empty-manifest.json) | 빈 집기 제작과 상품 합성 기준 |
| [계산대](2026-09-13-market-retail/checkout-manifest.json) | 생성·정규화·실행 파일 연결 |
| [상품 썸네일](2026-09-13-market-retail/stock-thumbnails-manifest.json) | 지도용 작은 이미지와 원본 연결 |

## 2. 플레이어·친구 캐릭터

| 자료 | 읽는 기준 |
| --- | --- |
| [플레이어 원본](../../frontend/assets/images/game/characters/player/reference/README.md) | 사용자가 제공한 `Group 6854.png` 보관·해시. 동작 스프라이트와 구분 |
| [사용자 스프라이트 v3](../../frontend/assets/images/game/characters/player/chibi-user-v3/README.md) | walk1의 뒤 걷기 + walk2의 나머지, 앞·뒤 idle 등 제작 내역 |
| [달리기 sprint2 출처](../../frontend/assets/images/game/characters/player/chibi-sprint2-v1/provenance.json) | 이후 교체된 달리기 원본. v3의 옛 sprint 설명과 구분 |
| [사용자 스프라이트 v1](../../frontend/assets/images/game/characters/player/chibi-user-v1/README.md), [v2](../../frontend/assets/images/game/characters/player/chibi-user-v2/README.md) | 뒤 방향 추가 전후의 과거 제작 기록 |
| [fresh-v4](../../frontend/assets/images/game/characters/player/fresh-v4/README.md) | 이전에 생성한 동작 기록. 이름만으로 최신 사용자 원본이라고 판단하지 않음 |
| [민수·지영 제작 기록](../../frontend/assets/images/game/characters/village/chibi-v1/README.md) | 친구 외형·비율·원본과 수정 내역 |

재생 속도·방향 반전·아틀라스·실제 표시 크기는 [공통 인수인계](../handoff/world-market-shared-2026-10-13.md)의 캐릭터 절과 현재 렌더러를 따른다. 새 버전이 생겨도 원본과 이전 제작 기록은 보존한다.

## 3. 마을·도서관·버스·새 활동

| 자료 | 담긴 내용 |
| --- | --- |
| [마을 cozy-v2](../../frontend/assets/images/game/environment/village/cozy-v2/README.md) | 나무·화단·수풀·벤치·가로등과 원본/실행 이미지 |
| [도서관 최초 에셋](../../frontend/assets/images/game/library/README.md) | 최초 집기와 사서 |
| [도서관 v2](../../frontend/assets/images/game/library/v2/README.md) | 책장 종류와 PC 책상 |
| [도서관 책 books-v3](../../frontend/assets/images/game/library/books-v3/README.md) | 추가 표지와 당시 도서 수 |
| [도서관 v4](../../frontend/assets/images/game/library/v4/README.md) | 확장 안내대·라운지·도서 표지 추가 |
| [도서관 v5](../../frontend/assets/images/game/library/v5/README.md) | 창문·전시·식물 등 실내 장식 |
| [도서관 v6](../../frontend/assets/images/game/library/v6/README.md) | 벽에 연결한 서가와 독립 서가 |
| [버스 생성·수정 이력](../../frontend/docs/bus-art-prompts.md) | 여러 세대의 내부·외관 그림과 프롬프트 |
| [버스 v4 원본](../../frontend/assets/images/game/bus/v4/source/README.md) | 당시 원본 보관 기록. 이후 v5 등 수정 전 상태 |
| [카페 근무](../../frontend/docs/cafe-shift.md) | 카페 이미지·비율·코드 매핑과 통합 확인 범위 |
| [빨래하는 날](../../frontend/docs/laundry-day.md) | 활동 흐름·저장 경계. 전체 화면 통합 검증 기록은 아직 미완 |

도서관의 각 버전 README에 나오는 도서 수·실내 치수는 당시 값이다. 최신 배치와 흐름은 [도서관·버스 인수인계](../handoff/library-bus-2026-10-13.md)를 먼저 읽는다. 버스 프롬프트 기록 중간의 ‘최종 v3’나 v4 운전자 설명도 해당 단계 기록이며, 마지막 수정과 현재 코드보다 우선하지 않는다.

## 4. 폰트·초기 톤 시안

- [웹 폰트 변환·검증](../../frontend/assets/fonts/web/README.md): 원본 보존과 WOFF2 변환 기록. 적용 폰트는 [theme.ts](../../frontend/src/theme.ts)와 로딩 매핑을 확인한다.
- [아트 바이블 v0.1](../../frontend/docs/game-art-bible.md): 초기 팔레트·투시·모듈 캐릭터 제안이다. 현재 스프라이트와 공통 이동 UI의 규격 문서로 사용하지 않는다.
- 2026-09-01 톤 비교 시안: [이야기책풍 마을](2026-09-01/tone-a-storybook-village.png), [평면 모듈형 마을](2026-09-01/tone-b-flat-modular-village.png), [그림책풍 마트](2026-09-01/tone-c-picturebook-market.png). 파일 이름만으로 현행 채택 여부를 단정하지 않는다.

폴더의 `contact-sheet`, `*-qa`, 카탈로그 검토 PNG는 검수 보조 이미지다. `*-master` 등 원본은 런타임용 이미지와 구분해서 보존한다. 프롬프트를 사후 복원한 요약은 실제 생성 요청 원문과 동일한 근거로 취급하지 않는다.
