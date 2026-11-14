# 마을·장보기·공통 게임 인수인계

확인일: 2026-10-13. 기준 코드: `a02ca8ad3c142f93485d8955a8394ac56f6094f8`, `frontend/`. 이 문서는 현재 코드와 저장소 문서를 확인한 운영 지도다. 이 날짜를 아래 기능 전부의 제작일로 해석하면 안 된다. 대화에 나온 제작·수정 요청의 정확한 날짜는 별도 근거가 없는 한 **미상**이다.

### 2026-10-17 추가: 마트 그리드 배치

장보기 시작 전 환경 설정과 **마트 안 휴대폰 → 설정 → 마트 배치 편집**에 진열대·종업원·손님을 그리드로 직접 배치하는 편집기를 추가했다. 배치 전용 JSON은 `oneuldo.market-layout` 버전 1이며, 전체 장보기 설정에는 `environment.tilemap`으로 함께 저장한다. 기존 세 매장의 벽·출입구·계산대 구조를 유지하고, 좌표·충돌·이동 가능 여부를 검증한 뒤 적용한다. 휴대폰에서 적용하면 장바구니와 진행을 보존하고 입구로 이동하며, 변경은 `layout_changed` 이벤트에 남긴다. 로컬 JSON 가져오기/내보내기가 범위이며 서버/API 연결은 포함하지 않는다. 사용 경로·좌표 규격·검증 범위는 [마트 그리드 배치 인수인계](../../frontend/docs/market-tilemap-editor.md)를 따른다. 아래 본문은 10월 13일 기준 설명을 보존한다.

## 1. 게임에 들어가는 방법과 연결 구조

앱의 게임 탭에서 **오늘도 마을 들어가기**를 누르면 하나의 마을에서 집·마트·버스 정류장을 이용한다. 실제 진입 버튼은 [GameScreen](../../frontend/src/screens/GameScreen.tsx), 화면 조합은 [AppShell](../../frontend/src/screens/AppShell.tsx), 게임 전체 연결은 [GamePrototypeScreen](../../frontend/src/screens/GamePrototypeScreen.tsx)에 있다. `Prototype`이라는 파일 이름과 달리 현재 플레이 가능한 마을의 중심 화면이다.

| 진입점 | 현재 연결된 활동 |
| --- | --- |
| 퀘스트 탭의 도서관 다녀오기 카드 | `initialActivity='day'`로 마을과 하루 일정 패널 진입 |
| 퀘스트 탭의 버스·장보기·장보기 부탁 진입 | `bus`·`market`·`errand` 활동 문맥으로 마을 게임 진입 |
| 마을 동쪽 정류장 | 목적지 선택 → 도착 버스 확인 → 승차 → 버스 내부 → 도서관 외부 |
| 마트 출입문 | [MarketSimulationScreen](../../frontend/src/screens/MarketSimulationScreen.tsx)을 마을 게임과 결합해 실행 |
| 집 안 냉장고 | 냉장고 확인 → 바나나 요거트 컵 만들기 |
| 마을 지영과 대화 | 계산 알바 연습 |
| 마을 민수와 대화 | 안전 퀘스트, 퇴근길 장보기 부탁·물품 전달 |
| 휴대폰의 바로 이동 | 우리 마을/하늘도서관 마을로 테스트용 이동. 진행 중 업무·버스 이동의 완료 기록을 만들지 않음 |

게임마다 별도 시작 앱을 추가하기보다 이 연결을 사용한다. 도서관 출입 후에는 도서관 외부 정류장으로 돌아오고, 버스로 우리 마을에 돌아올 수 있다. 집·마트·도서관·버스 내부의 구현 화면은 나뉘어 있으나 사용자는 이어진 생활 세계로 경험해야 한다.

### 하루 일정과 민수 부탁

[dayJourney](../../frontend/src/game/dayJourney.ts)는 **버스로 도서관 가기 → 사서 업무 완료 → 버스로 마을 돌아오기 → 우리 집 도착**의 네 단계를 관리한다. 단계는 `available → outbound → working → returning → home → completed`다. [DayJourneyPanel](../../frontend/src/components/game/DayJourneyPanel.tsx), [QuestScreen](../../frontend/src/screens/QuestScreen.tsx), [GameHud](../../frontend/src/components/game/GameHud.tsx)에서 일정을 확인한다.

- 버스 이동은 현재 일정 시작 이후의 탑승 이벤트가 있는 완료 세션만 인정한다. 도서관 업무는 책 전부 처리 및 손님 전원 해결 후 사서에게 보고한 결과만 인정한다.
- `getDayBusDraft` / `getDayLibraryDraft`는 화면을 오가는 동안 이어 하는 메모리 상태다. 앱 종료 후 복원하는 중간 저장으로 설명하면 안 된다.
- 도서관 업무 완료 후 민수의 부탁이 생기며, 마을의 민수에게 먼저 말을 걸어도 부탁을 받을 수 있다. 수락하거나 나중에 받기를 선택한다.
- [shoppingErrand](../../frontend/src/game/shoppingErrand.ts)는 **우유 1개·사과 2개** 부탁, 원래 가격 합계의 예산, 품절 시 대체 승인/미구매 사유, 예산 초과 알림, 실제 민수 앞에서 전달하기를 관리한다. 별도 음료 자유 선택과 계산원 오청구는 이 부탁의 마트 설정에서는 꺼진다.
- 다른 판의 성공 기록이나 합성 플레이 결과로 물건을 채울 수 없다. 수락 후 연결된 `sessionId`, `provenance.source='human'`, 구매 성공과 결제 이벤트, 실제 최종 장바구니를 확인한다. 예산 추가 승인은 10,000원 이하 정수이며, 승인 전에는 전달할 수 없다.
- [shoppingErrandStore](../../frontend/src/game/shoppingErrandStore.ts)는 같은 출처의 부탁 중복 생성을 막으며 현재 앱 실행 동안만 유지한다. 하루 일정 완료와 민수 부탁 완료는 별개의 조건이다.

[dailyQuests](../../frontend/src/game/dailyQuests.ts)에는 냉장고, 민수 안전 퀘스트, 버스 목적지 찾기, 장보기 목록 퀘스트가 따로 있다. 이 로컬 상태와 앱의 서버 퀘스트 데이터를 하나의 영구 진행도로 오해하지 않는다.

## 2. 마을·공간·NPC

| 변경하려는 대상 | 먼저 읽을 파일 |
| --- | --- |
| 건물·NPC·장식 좌표와 기본 충돌 | [prototypeWorld](../../frontend/src/game/prototypeWorld.ts) |
| 도로·둥근 인도·횡단보도 도형 | [villageStreets 데이터](../../frontend/src/game/villageStreets.ts), [VillageStreets 렌더러](../../frontend/src/components/game/VillageStreets.tsx) |
| 이동 가능 구역·길 찾기 | [villageNavigation](../../frontend/src/game/villageNavigation.ts) |
| 건물·바닥·외곽 장식의 합성 | [PrototypeWorldLayers](../../frontend/src/components/game/PrototypeWorldLayers.tsx), [gameAssets](../../frontend/src/game/gameAssets.ts) |
| 민수·지영·수진 이미지와 배율 | [villageNpcArt](../../frontend/src/game/villageNpcArt.ts) |
| 마을·마트 카메라 확대와 포인터 좌표 변환 | [worldZoom](../../frontend/src/game/worldZoom.ts) |

보존할 사용자 결정: 좁은 인도와 교차로 한가운데 횡단보도·정류장을 피하고, 건물과 캐릭터의 비율을 맞춘다. 마을 외곽은 딱 잘린 바닥보다 이어지는 풍경처럼 보이게 한다. 장식 이미지만 확대하고 충돌·상호작용 좌표를 그대로 두지 않는다. 앞뒤 가림 순서는 캐릭터의 발과 물체 바닥 기준으로 확인한다.

민수·지영·수진은 현재 각각 정면 표시 에셋이 연결되어 있다. 민수는 검정 머리·체크 셔츠·흰 이너·하늘색 바지, 지영은 갈색 웨이브 머리·흰 상의·검정 바지라는 사용자 설정을 유지한다. 플레이어 원본의 갈색 선, 선 두께, 신체 비율이 기준이다. 민수의 머리색을 갈색으로 바꾸거나 플레이어의 넓은 후드 실루엣을 셔츠에 그대로 복제하지 않는다. 현재 NPC 아트는 128×192 논리 캔버스와 `(64,186)` 피벗을 공유하고 배율은 0.5다.

마을의 모든 건물에 내부 활동이 구현된 것은 아니다. 건물 에셋·좌표가 있다고 그 건물의 게임이 완성됐다고 보고하지 않는다.

## 3. 장보기의 현재 플레이 흐름

1. 시작 설정에서 조건을 고르고 부탁 목록을 확인한다. 기본 목록은 우유 1개·사과 2개·카레 1개이며, 민수 부탁으로 들어오면 별도 목록을 사용한다.
2. 진열대에서 물건을 확인하고 장바구니에 넣거나 돌려놓는다. 직원에게 **이 물건은 어디에 있나요?**를 물으면 현재 목표 품목 중 선택한다.
3. 품절 과제가 켜져 있으면 첫 목표 상품 진열대에서 품절을 발견한다. 직원에게 재고를 확인하고, 부탁한 사람에게 전화해 대체 허락을 받거나 구매하지 못한 이유를 전달한다. 직원 대화가 지영을 개인적으로 아는 내용이 되면 안 된다.
4. 추가 음료 선택이 켜진 일반 장보기에서는 정해진 예산 이내 음료 1개를 스스로 고른다. 기존 부탁의 물건 하나를 두 과제에 중복 계산하지 않는다.
5. 유인 계산대에서 POS 계산 내역을 확인하거나, 키오스크에서 하나씩 스캔한 뒤 결제한다.
6. 최종 목록·수량·추가 음료 예산·유인 계산 내역을 판정한다. 첫 실패에는 일반 안내, 두 번째부터는 구체적인 차이를 보여주고 재시도할 수 있다. 결과에서 난이도/흥미 별점을 남기거나 건너뛴다.

### 계산 UI와 판정에서 보존할 것

- **유인 POS:** 한국 마트 POS를 참고한 상품명·단가·수량·금액 표와 큰 합계 표시다. `개수가 잘못된 것 같아요` 또는 상품 줄 선택 → 실제 담은 수량 요청 → 계산원 답변 → 내역 확인으로 이어진다. 정상 상품을 다시 확인해 달라고 해도 감점하지 않는다.
- `이대로 결제하기`와 `다시 고르기`는 같은 크기의 결정 버튼이다. 계산 화면에서 `그만두기`를 되살리지 않는다. 다시 고르기는 장보기로 돌아간다.
- **키오스크:** 한 계산대 세로 줄을 키오스크 두 대로 바꾸며, 상품을 그림 중심 가로 목록으로 보여준다. 그림을 스캐너로 끌거나 상품명 버튼을 눌러 스캔한다. 스캔·확인·결제 단계마다 모니터·상판의 크기를 바꾸지 않는다. 모바일 그림 드래그와 목록 좌우 스크롤의 입력 영역을 구분한다.
- 유인 계산 실수는 장바구니 상품 하나를 한 개 더 청구하는 조건이다. 정정은 실제 장바구니 수량 기준이다. 부탁보다 많이 담은 장바구니를 그대로 정정한다고 장보기 과제가 성공하지는 않는다.
- 장바구니·진열대에는 자동 총액/정답을 선제적으로 추가하지 않는다. 계산기에는 사용자가 직접 수를 넣고 POS·키오스크에서는 실제 청구 금액을 본다.
- 출구로 들어오는 역방향 행동과 미결제 출구 통과 경보는 별도 기록·감점이다. 입구 공사 시 안쪽 입구를 안내한다. 기본 감점 값은 각각 설정 가능하다.
- 별점은 가운데 정렬, 빈 별도 베이지색의 채운 별이다. 아웃라인 별로 되돌리지 않는다.

상세 흐름과 당시 검증 자료: [품절·선택·키오스크](../market-v8-shopping-learning-kiosk.md), [POS·수량 정정](../market-checkout-review-2026-09-24.md), [직원 대화](../market-v7-staff-dialogue.md), [환경/에피소드 API](../market-environment-handoff.md). 각 문서의 과거 테스트 숫자는 해당 문서 작성 시점의 결과다.

### 설정과 구현 파일

| 항목 | 값/의미 | 근거 |
| --- | --- | --- |
| 난이도 | `family` 같은 종류 허용 / `exact` 정확한 상품 | [marketSession](../../frontend/src/game/marketSession.ts) |
| 재현 조건 | seed, 시작 시각, 목표 상품·수량, 재고/상품 목록, provenance | 위 파일 |
| 매장 배치 | `classic`, `aisles`, `corner`; 직원·손님·기둥·의자 수, 계산원 수, 입구 공사, 진열 순서 | [marketEnvironment](../../frontend/src/game/marketEnvironment.ts) |
| 계산대 | `kioskLane=none/checkout/checkout-2/random`; 구버전 `kioskPresent` 호환 | 위 파일 |
| 품절 | `stockoutEnabled=true`, `allowSubstitution=true`가 기본 | [marketLearning](../../frontend/src/game/marketLearning.ts) |
| 음료 선택 | `budgetChoiceEnabled=true`, `choiceBudget=3000` 기본 | 위 파일 |
| 오청구 | `normal/overcharge/random`; 설정 생략 JSON은 normal, 일반 UI 새 게임은 random | 위 파일 + [MarketSimulationScreen](../../frontend/src/screens/MarketSimulationScreen.tsx) |
| 표시 테마 | `classic` 기본 마트 / `cozy` 동네 마트 | [marketInteriorThemes](../../frontend/src/game/marketInteriorThemes.ts) |

조정 UI는 [MarketSetupPanel](../../frontend/src/components/game/MarketSetupPanel.tsx), 상태·행동·판정·연구용 내보내기는 `marketSession.ts`, 계산 검증은 [marketCheckoutReview](../../frontend/src/game/marketCheckoutReview.ts)다. 과거 설정의 생략값과 일반 화면 기본값이 다를 수 있으므로 재현 보고서에는 실제 실행 설정 JSON을 붙인다.

매장 화면은 [MarketMap](../../frontend/src/components/game/MarketMap.tsx), [MarketInteriorLayer](../../frontend/src/components/game/MarketInteriorLayer.tsx), [MarketArchitectureLayer](../../frontend/src/components/game/MarketArchitectureLayer.tsx), 진열대 팝업은 [MarketShelfScene](../../frontend/src/components/game/MarketShelfScene.tsx), 계산 UI는 [MarketStaffedCheckout](../../frontend/src/components/game/MarketStaffedCheckout.tsx) / [MarketKioskCheckout](../../frontend/src/components/game/MarketKioskCheckout.tsx)다. 상품은 [marketCatalog](../../frontend/src/game/marketCatalog.ts), [scenarios](../../frontend/src/game/scenarios.ts), 상품 이미지 매핑은 [marketProductImages](../../frontend/src/game/marketProductImages.ts)와 [marketRetailImages](../../frontend/src/game/marketRetailImages.ts)를 함께 확인한다.

테마 변경은 바닥·벽·집기 아트 중심이며 상품·캐릭터와 게임 규칙을 바꾸는 기능이 아니다. `cozy-v1`의 생성 가구는 기존 앵커와 상품 진열 위치를 보존하도록 처리된다. [marketInteriorThemeArt](../../frontend/src/game/marketInteriorThemeArt.ts), [prepare-market-theme.cjs](../../frontend/scripts/prepare-market-theme.cjs)를 참고한다.

## 4. 요리와 계산 알바

### 요리

[CookingSimulationScreen](../../frontend/src/screens/CookingSimulationScreen.tsx)은 [cookingRecipe](../../frontend/src/game/cookingRecipe.ts)의 **바나나 요거트 컵**을 구현한다. 집 냉장고에서 진입한다. 불·칼 없이 도구/재료 준비 → 껍질 벗기기 → 조각 옮기기 → 요거트 담기 → 선택 토핑 → 원형으로 섞기 → 차리기 → 정리의 8단계다. 드래그 방향·거리, 원 그리기, 단계별 힌트, 연습/도전 모드, 도전 시간 제한과 결과 화면이 있다. 시리얼은 선택 사항이다.

이 화면의 안전 문구가 사용자 프로필 기반 알레르기·삼킴 평가 서버에 연결된 것은 아니다. 실제 지원 정보 연동 여부를 별도 검증해야 한다. 현재 마을 호출부는 `onClose`만 전달하며 `onComplete`를 활동 앨범/서버에 연결하지 않는다. 상태는 화면 내부 메모리다.

### 계산 알바

[CashierSimulationScreen](../../frontend/src/screens/CashierSimulationScreen.tsx)은 지영의 `계산 알바 연습` 선택지에서 열린다. 연습은 손님 1명, 도전은 2명이며 상품 스캔 → 필요 시 중복 영수증 정정 → 거스름돈 선택 → 영수증 전달 → 결과 순서다. 도전의 스캔/영수증/결제 제한 시간은 35/25/25초다. 시간 초과 시 해당 단계를 이어 하는 동작이 있다.

이 계산 알바는 **고객으로 결제하는 마트 POS/키오스크**와 별개다. 현재 로컬 화면 상태로 작동하고 별도 에피소드 저장·활동 앨범 연결은 없다. 신규 게임을 만들 때 이 화면을 마트 결제 구현으로 착각해 수정하지 않는다.

## 5. 공통 조작·카메라·스프라이트

### 조작과 카메라

- [GameControls](../../frontend/src/components/game/GameControls.tsx)의 플로팅 슬라이드 패드와 상호작용 버튼을 재사용한다. 게임마다 모양·위치·조작법을 새로 만들지 않는다.
- 기본 달리기 모드는 `distance`: 패드를 멀리 밀면 달린다. [movementControls](../../frontend/src/game/movementControls.ts)의 시작 0.78/해제 0.64 히스테리시스로 손 떨림에 의한 걷기/달리기 교대를 줄인다. 달리기 배율은 1.55다. 설정의 `toggle` 모드에서는 발자국 버튼으로 켜고 끈다.
- 웹 키보드는 WASD/방향키 이동과 Shift를 누르는 동안 달리기를 지원한다. 포커스 해제·화면 전환·대화 잠금 시 입력을 해제하는 처리를 보존한다.
- 슬라이드 패드 모드에서 물체를 눌렀다고 일반 이동 경로를 자동 시작하지 않는다. `onWorldTap`은 버스 좌석 같은 명시적 상호작용의 터치가 패드 영역에 가려질 때 사용하는 선택적 전달 기능이다. 이를 전체 마을의 자동 이동으로 확대하지 않는다.
- 카메라·캐릭터 위치·발걸음은 같은 이동 갱신에서 처리한다. 화면 크기·줌에 따라 화면 좌표와 월드 좌표를 변환해야 한다. `worldZoom.ts`의 공통 변환을 우회해 클릭 위치를 직접 계산하지 않는다.
- 나무·PC·책장 등의 앞뒤 판정은 바닥 깊이에 맞춘다. 큰 이미지의 상단 또는 중앙을 기준으로 정렬하면 캐릭터가 아래에 있는데 물체 뒤로 가는 문제가 재발한다.

### 캐릭터 원본과 런타임

원본 `Group 6854.png`는 [player-original-turnaround.png](../../frontend/assets/images/game/characters/player/reference/player-original-turnaround.png)에 보존했다. [원본 README](../../frontend/assets/images/game/characters/player/reference/README.md)에 크기·해시·기존 기록상의 전달일이 있다. `Downloads`나 임시 클립보드 경로를 런타임 의존성으로 만들지 않는다.

걷기·대기의 원천은 [chibi-user-v3 README](../../frontend/assets/images/game/characters/player/chibi-user-v3/README.md), 최신 달리기 원천은 [chibi-sprint2-v1 provenance](../../frontend/assets/images/game/characters/player/chibi-sprint2-v1/provenance.json)에 남아 있다.

- 뒤 정면 걷기는 `walk1`, 나머지 걷기는 `walk2`. 뒤 사선의 좌우 반전 방향을 바꾸지 않는다.
- idle은 앞/뒤 정면만 사용한다. 과거의 완전 정지 요청은 이후 사용자가 **앞·뒤 정면의 대기 애니메이션 재생**으로 수정했다. 현재 36프레임, 프레임 간격 62.5ms, 한 주기 2.25초다.
- 최신 sprint는 `sprint2.png`에서 분리한 프레임을 사용한다. 과거 `sprint.png`로 다시 연결하면 안 된다.
- 현재 런타임은 [chibiPlayerAvatar](../../frontend/src/game/chibiPlayerAvatar.ts)의 아틀라스와 [DirectionalAvatar](../../frontend/src/components/game/DirectionalAvatar.tsx)를 사용한다. [prepare-player-atlases.cjs](../../frontend/scripts/prepare-player-atlases.cjs), [atlas-audit.json](../../frontend/assets/images/game/characters/player/chibi-atlas-v1/atlas-audit.json)이 생성 경로·프레임 원천이다.
- 매 프레임 이미지를 새로 불러오지 않고 한 시트의 자르는 위치를 옮긴다. [avatarAnimation](../../frontend/src/game/avatarAnimation.ts)의 실제 충돌 해결 후 이동 거리로 걷기/달리기 프레임을 고른다. 단순 타이머로 교체하면 벽에 부딪혀도 걷거나 저속 이동에서 발이 미끄러질 수 있다.
- 아틀라스 X/Y 좌표를 **하나의 Animated.Value**로 함께 갱신하는 부분은 모바일 흔들림 수정이다. `ValueXY`의 개별 X/Y flush로 되돌리지 않는다.
- 새 방향은 로딩 완료 후 표시하고 이전 프레임을 유지한다. [avatarAtlasCache](../../frontend/src/game/avatarAtlasCache.ts)는 요청 방향만 다운로드, 동시 2개, 8초 타임아웃, 실패 시 2초 뒤 최대 2회 시도를 사용한다. 표시 배율×기기 픽셀비에 따라 고해상도 시트를 선택한다.
- 네트워크 타임아웃으로 이동을 막지 않고 작은 idle 대체 이미지를 표시한다. 다운로드는 취소 불가라 타임아웃 요청이 끝나기 전 슬롯을 반환하지 않는 의도도 유지한다.

새 아트를 만들 때 생성만 완료하고 끝내지 않는다. 원본/프레임 감사자료, 투명 여백, 발 피벗, 동작 사이 신장, 좌우 방향, 모바일 크기별 화질, 용량을 함께 확인한다.

## 6. 휴대폰·음악·폰트

휴대폰은 [GamePhonePanel](../../frontend/src/components/game/GamePhonePanel.tsx), 외형 크기는 [phoneLayout](../../frontend/src/game/phoneLayout.ts)을 사용한다. 현재 비율은 390:750, 최대 폭 360이며 창이 짧으면 전체 비율을 유지해 축소한다. 모든 앱에서 같은 외곽 프레임과 둥근 화면 안쪽 곡률을 유지한다. 아주 길었던 비율을 그대로 복원하지 않는다.

홈은 전화·사진·버스 노선·계산기·금융·설정·바로 이동·비상 탈출·게임 나가기 9개 앱이다. 금융은 의도적으로 비활성 버튼이다. 전화는 지영/민수 선택을 거친다. 계산기는 사칙연산이고 장바구니 정답 계산 기능이 아니다. `내 휴대폰` 제목과 불필요한 `준비중` 문구를 되살리지 않는다. X와 홈 표시줄 동작은 유지한다.

[PhoneSettings](../../frontend/src/components/game/PhoneSettings.tsx)는 조작 방식, 달리기 모드, 배경색, 마트 테마, 배경음악/효과음을 **한 페이지**에 놓는다. [PhoneAppIcon](../../frontend/src/components/game/PhoneAppIcon.tsx)의 별도 둥근 clipping 컨테이너와 그림자 컨테이너는 모바일 아이콘 모서리 문제를 막기 위한 구조다.

[GameBackgroundMusic](../../frontend/src/components/game/GameBackgroundMusic.tsx)은 기존 기본 음량에 0.75 gain을 적용한다. 평상시 실효값은 `설정 음악 음량 × 0.75 × 0.5`, 대화 중은 `×0.25`다. 최초 재생 전에도 볼륨을 적용하고 `player.isLoaded`를 확인한다. `useAudioPlayerStatus`의 주기적 갱신을 큰 월드 화면으로 옮기면 지형이 주기적으로 끊기는 문제가 재발할 수 있다. 대화 효과음은 [useDialogueAudio](../../frontend/src/components/game/useDialogueAudio.ts), 피드백은 [dialogueFeedback](../../frontend/src/game/dialogueFeedback.ts)을 확인한다.

폰트 토큰은 [theme](../../frontend/src/theme.ts)에 있다. Pretendard·LaundryGothic·KyoboHandwriting 외에 `gameHud=Griun-InaDoongdoong`, Cafe24 Ssurround/Air가 추가되어 있다. 실제 로딩은 [App.tsx](../../frontend/App.tsx), 웹 경량 파일은 [fonts/web README](../../frontend/assets/fonts/web/README.md)를 따른다. 대화에서 추천한 폰트가 모두 채택된 것은 아니다. 특정 화면에서 어느 토큰을 쓰는지 확인하고 수정한다.

HUD의 **11:45와 30,000원은 현재 고정 표시**다. 실시간 시계·계좌 잔액·게임 전체 경제 저장이 완성됐다는 뜻이 아니다.

## 7. 저장·기록·앨범의 경계

| 데이터 | 현재 저장 방식 | 다른 PC/앱 재시작의 의미 |
| --- | --- | --- |
| 마트 종료 에피소드 | [marketEpisodeStore](../../frontend/src/game/marketEpisodeStore.ts), `oneuldo.market.episodes.v1`, 최대 20개, 5MiB 범위에 맞춰 오래된 영구 항목 축소 | 웹 localStorage가 있으면 브라우저에 유지. native는 메모리 fallback이며 JSON 공유 필요 |
| 마트 배치 보관함 (2026-10-17 추가) | [marketLayoutStore](../../frontend/src/game/marketLayoutStore.ts), 최대 24개 배치·32자 이름, 웹 localStorage + Web Locks, native Expo FileSystem 문서 파일 | 앱 재시작 후 유지. 다음 방문 자동 적용·서버 동기화 아님. 다른 기기로는 JSON 공유. 저장 실패/손상 시 기존 내용을 초기화하지 않음 |
| 활동 앨범 | [activityAlbum](../../frontend/src/game/activityAlbum.ts), `oneuldo.activity-album.v1`, 최대 100개 완료 요약 | 웹 localStorage, 없거나 불가하면 실행 중 메모리. 서버 동기화 아님 |
| 음악/효과음/배경색/달리기 모드/마트 테마 | [gamePreferences](../../frontend/src/game/gamePreferences.ts), `oneuldo.game-preferences.v1` | 웹만 localStorage; native는 메모리. 조이스틱/터치 선택 자체는 이 저장 객체에 없음 |
| 하루 일정/진행 중 버스·도서관 초안 | `dayJourney.ts`의 공유 메모리 | 같은 실행 안 화면 왕복용. 앱 종료 시 복원 보장 없음 |
| 민수 장보기 부탁 | `shoppingErrandStore.ts` 공유 메모리 | 같은 실행 동안 유지. 영구 세이브 아님 |
| 일일 퀘스트·요리·계산 알바 | 화면 로컬 상태 | 화면 재생성·앱 종료를 넘는 영구 저장이 구현되어 있다고 가정하지 않음 |

앨범 UI는 [PhonePhotos](../../frontend/src/components/game/PhonePhotos.tsx)다. 최초에는 빈 상태, 완료하면 날짜별 목록·활동별 앨범·즐겨찾기·검색·상세 기록이 생긴다. 버스/도서관/장보기/물품 전달의 **완료 결과 요약**을 사용하며 이미지들은 활동 일러스트다. 실제 플레이 화면을 자동 촬영한 사진은 아니다. 활동 종류+세션 ID로 중복을 막는다. 요리/계산 알바는 현재 앨범 종류에 없다.

마트 배치 편집기의 **보관함**은 도면 미리보기·이름 변경·복제·명시적 덮어쓰기·삭제를 지원한다. 불러오기는 편집 초안만 바꾸고 **배치 적용**에서 게임에 반영한다. **실제 모습 / 여기서 걸어보기**는 현재 게임의 그림·공통 이동 패드·실제 충돌을 사용하는 별도 미리보기이며, 장바구니·점수·진행·플레이어 위치·실제 테마를 바꾸지 않는다. 편집으로 돌아와도 초안과 실행 취소 이력을 유지한다. 저장 범위와 플랫폼 제약, 관련 파일은 [마트 배치 편집 문서](../../frontend/docs/market-tilemap-editor.md)에 정리했다.

완료 에피소드의 연구용 원시 이벤트, 사용자에게 보여주는 활동 앨범, 서버에 전송하는 결과를 구분한다. 로컬 저장이 있다고 계정 공용 저장이라고 설명하거나, 다른 팀원의 테스트 기록까지 같은 기기 기록이라고 단정하면 안 된다. 사람/AI 장보기 기록은 `provenance.source`로 구별한다. 합성 기록을 실제 당사자의 능력·교육 효과 증거로 사용하지 않는다.

## 8. 수정 후 확인과 남은 검증

이 인수인계 작성에서는 소스·문서·테스트 파일을 확인했다. 이 문서 자체의 작성으로 아래 전 경로를 실기기에서 다시 실행한 것은 아니다.

| 범위 | 회귀 테스트 출발점 |
| --- | --- |
| 마을 깊이·NPC 아트·카메라 | `GameVillagePlayerDepth`, `VillageNpcArt`, `worldZoom` |
| 하루 일정/퀘스트 진입/민수 부탁 | `dayJourney`, `DayJourneyFlow`, `QuestJourneyEntry`, `shoppingErrand`, `ShoppingErrandIntegration`, `ShoppingErrandPanel` |
| 장보기 일반·환경·판정 | `MarketSimulationScreen`, `MarketScenario`, `MarketSetupPanel`, `MarketMap`, `marketEpisodeStore` |
| POS·키오스크·테마 | `MarketStaffedCheckout`, `MarketKioskCheckout`, `MarketInteriorThemes`, `MarketInteriorLayer` |
| 공통 조작·애니메이션 | `GameControls`, `movementControls`, `avatarAnimation`, `DirectionalAvatarAtlas`, `DirectionalAvatarAtlasAtomic`, `avatarAtlasCache` |
| 휴대폰·앨범·음악 | `PhonePhotos`, `activityAlbum`, `gamePreferences`, `GamePrototypeAudio` |
| 요리·계산 알바 | `CookingSimulation`, `CookingSimulationUpgrade`, `CashierSimulation` |

파일은 모두 [frontend/__tests__](../../frontend/__tests__) 아래에 있으며 이름에 `.test.ts` 또는 `.test.tsx`가 붙는다. 공통 로직 수정 시 관련 테스트·타입 검사·웹 빌드를 실행한다. 브라우저 모바일 에뮬레이션과 Expo Go 실기기 검증은 별도다.

다음 담당자가 먼저 확인할 실제 기기 항목:

1. 외부 터널에서 첫 로딩 후 앞/뒤/사선 walk·sprint 전환, 멈춘 뒤 앞/뒤 idle, 방향 급전환 시 깜빡임과 아틀라스 행 경계 떨림.
2. 음악 최초 진입 음량, 대화 시 감쇠, 음악 재생 중 지형의 주기적 끊김 여부.
3. 좁은 화면에서 플로팅 패드와 좌석/상품 터치의 간섭, 키오스크 드래그와 가로 스크롤 구분.
4. NPC·진열대·PC 아래로 걸어갈 때 깊이 정렬과 시각 크기에 맞는 충돌.
5. 민수 부탁 수락부터 품절 처리·결제·예산 승인·전달까지, 치트 이동이 완료 기록을 허위 생성하지 않는지.
6. 앱 강제 종료 후 기록/설정이 남는지 확인할 때 플랫폼별 저장 제한을 먼저 설명하기. 영구 중간 저장과 서버 동기화는 별도 기능으로 설계해야 한다.

이번 문서는 기능을 새로 구현한 작업이 아니다. 주차별 활동 일지에는 위 기능 목록을 그대로 한 주 작업으로 넣지 말고, 당시 커밋·문서 날짜·검증 근거가 확보된 항목만 해당 주차에 배치한다.
