# 장보기 실험 설정과 AI 실행 인터페이스

구현 파일은 `src/game/marketSession.ts`, 공간 설정은 `src/game/marketEnvironment.ts`입니다. 사람의 화면 조작과 이후 AI 실행기가 같은 상태 전이와 판정 규칙을 사용합니다. 이 문서는 정우·재현이 다음 단계 실행기를 연결할 때 사용할 계약입니다. 실제 모델 호출, 페르소나 생성, 서버 업로드, 파인튜닝은 포함하지 않습니다.

## 원인 조건과 결과 기록

하나의 에피소드에 seed, 설정, 실제 생성된 마트 배치, 상품 진열, 최초 재고, 구매 조건, 출처를 함께 저장합니다. 여기에 이동, 진열대·직원·계산대 상호작용, 상품 담기·빼기, 출입 경보와 감점, 최종 구매 제출, 재시도, 포기, 별점 이벤트가 쌓입니다. 최종 결과는 구매 제출 횟수와 `success` 또는 `gave-up`, 점수·실제 감점 합계·경보 횟수·결제 여부입니다.

설정은 실험 조건이며 이동·선택·수정 기록은 그 조건에서 발생한 행동입니다. 둘을 정답 라벨로 바로 간주하지 않습니다. 기존 분석·퀘스트 생성 파이프라인에 연결할 때 이 에피소드 식별자와 분석 결과 식별자를 연결해야 합니다. 현재 프론트엔드에서 서버나 파이프라인을 실제로 호출하지 않습니다.

## 설정 예

```ts
import { createMarketAgentAdapter } from '../src/game/marketSession';

const runner = createMarketAgentAdapter({
  seed: 'experiment-2026-09-11-001',
  sessionId: 'persona-a-run-001',
  startedAt: '2026-09-11T09:00:00.000Z',
  difficulty: 'exact',
  objectives: [
    { productId: 'low-fat-milk', quantity: 2 },
    { productId: 'apple', quantity: 1, match: 'family' },
    { productId: 'zero-cola', quantity: 1 },
  ],
  stockPerProduct: 6,
  alarmPenaltyPoints: 10,
  cashierRequestPenaltyPoints: 10,
  stockOverrides: { 'low-fat-milk': 3 },
  environment: {
    layoutId: 'classic', // 'aisles': 가로 통로, 'corner': 모퉁이 지점
    entranceConstruction: false, // true이면 안쪽 입구 하나를 공사 펜스로 폐쇄
    employeeCount: { min: 1, max: 3 },
    customerCount: { min: 1, max: 5 },
    pillarCount: 2,
    chairCount: 0,
    cashierCount: 0,
    kioskPresent: true,
    shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'],
  },
  provenance: {
    source: 'synthetic',
    agentModel: '실제로 사용한 모델 이름과 버전',
    personaId: 'persona-a',
    personaVersion: '1',
  },
});

const observation = runner.observe();
const afterMove = runner.act({ type: 'move', dx: 0, dy: -20 });
```

`seed`와 설정이 같으면 마트 배치와 진열 상품이 같습니다. 시간이 들어가는 기록까지 동일하게 재현하려면 `startedAt`과 행동 순서·시각도 같아야 합니다. `sessionId`는 동일 조건을 반복 실행할 때 매 실행마다 다르게 지정합니다. 기본 `startedAt`은 결정적 테스트를 위한 1970년 기준 시각이므로 실제 수집에서는 실행 시작 시각을 지정합니다. 각 행동의 선택 필드 `at`에 ISO 시각을 전달하면 실제 시각을 기록합니다. 시각을 생략하면 직전 이벤트보다 1ms 뒤인 논리 시각을 사용합니다. 따라서 시각을 생략한 에피소드에서 실제 반응 시간을 계산하면 안 됩니다.

## 설정 필드

| 필드 | 의미와 범위 |
| --- | --- |
| `seed` | 문자열 또는 유한 숫자. 마트 공간과 상품 선정 난수의 기준 |
| `difficulty` | `family`: 같은 품목군의 상품을 합산. `exact`: 지정 상품만 인정 |
| `objectives` | `{productId, quantity, match?}` 배열. 1~36개 조건, 수량 1~99. 개별 `match`가 전체 난이도보다 우선 |
| `stockPerProduct` | SKU별 기본 재고 1~99개 |
| `alarmPenaltyPoints` | 미결제 장바구니로 입구·출구·측면 문의 감지선을 바깥 방향으로 넘을 때 감점. 0~100, 기본 10 |
| `cashierRequestPenaltyPoints` | 계산원이 한 곳 이상 있는데 직원에게 추가 계산원을 요청할 때 감점. 정수 0~100, 기본 10. 경보기 감점과 독립적이며 예전 설정에서 생략하면 10 |
| `stockOverrides` | `{상품ID: 재고}`. 상품별 0~99개로 덮어쓰기 |
| `inventoryProductIds` | 선택 사항. 분류마다 서로 다른 12개 상품 ID로 고정. 이전 9개 입력은 목표·재고 검증 후 다른 상품 3개를 seed로 추가하고 설정에 12개를 기록 |
| `environment.layoutId` | `classic`: 기본 배치, `aisles`: 가로 통로 배치, `corner`: 별도 건물의 모퉁이 지점. 생략 시 `classic`, 다른 값은 거부 |
| `environment.entranceConstruction` | 선택 사항인 boolean. 생략 시 `false`. `true`이면 안쪽 입구만 폐쇄하며 외부 공동문·출구·옆문은 유지 |
| `environment` | 매장 배치, 종업원·손님·기둥 수, 계산원 0/1/2/랜덤, 키오스크 유무, 진열대 순서, 사전 정의 위치 후보 풀 |
| `provenance` | 사람/합성 출처와 참가자·모델·페르소나 버전 등 수집 메타데이터 |
| `startedAt`, `sessionId` | 기록 시작 시각, 실행 식별자 |

종업원은 1~3명, 손님은 1~5명입니다. 계산원은 종업원 수와 별개이며 두 계산대에 총 0~2명을 배치합니다. `cashierCount:'random'`이면 인원과 담당 계산대를 seed로 결정합니다. 기둥은 0~4개, 범위 `{min,max}`를 지정하면 seed로 그 사이 수를 선택합니다. 휴게 공간은 매장 안 두 곳과 아래 공용 로비 두 곳에 의자–원형 탁자–의자 세트가 고정됩니다. 로비에는 작은 화분도 있으며 두 좌석 사이 최소 65px 통로와 오른쪽 주 출입 동선을 유지합니다. 이전 `chairCount` 0~4 입력은 가져오기를 허용하지만 실제 설정은 0으로 정규화하며 단독 의자를 추가하지 않습니다.

`classic`은 기존 북서·북동 가로 묶음 두 개와 가운데 좌·중·우 세로 묶음 세 개입니다. `aisles`는 위쪽 두 묶음, 중간 두 묶음, 아래 중앙 한 묶음을 모두 가로로 놓아 가로 통로를 만듭니다. `classic`과 `aisles`는 같은 출입문·계산대·세 경보기·벽 구조를 사용하고 진열대 바닥과 일부 직원·손님 좌표, 직원 접근점이 함께 바뀝니다. `corner`는 폭·높이와 외벽, 계산 구역, 동쪽 복도, 엘리베이터와 공동문까지 별도로 정의한 L자형 건물입니다. 설정 화면의 ‘매장 배치’에서 선택하거나 JSON의 `environment.layoutId`로 지정합니다. 기본 순서는 `produce,fresh,household,meal,drink`이며 `shelfOrder:'random'`으로 분류를 섞거나 5개 배열로 지정할 수 있습니다. 기존 4개 배열은 세 번째 위치에 `household`를 추가하여 가져옵니다. 각 묶음에 두 그림이 있어도 목적지·상호작용·진열 재고는 하나입니다. 위치 후보 ID는 세 배치가 공유하며 `getMarketLayoutSlots(layoutId)`에서 선택한 배치의 실제 좌표를 읽습니다. 기존 `MARKET_*_SLOTS` 내보내기는 기본 배치와 이전 후보 풀 호환을 위해 유지합니다. 선택지 ID와 한국어 이름은 `MARKET_LAYOUT_OPTIONS`에 있습니다.

## 인물 외형 기록 (2026-09-11)

종업원 외형은 남성 2종·여성 2종, 손님은 성인·노인·어린이 × 남성·여성 × 2종의 12종입니다. `src/game/marketPeople.ts`의 순서를 안정된 카탈로그로 사용합니다. `environment.employees[]`와 `customers[]`에는 기존 숫자 `appearance`와 명시적인 `appearanceId`를 함께 기록하고, `environment.checkouts[]`의 `cashierAppearance`는 종업원 카탈로그 인덱스입니다. 나이 구분은 `adult`, `senior`, `child`, 성별 구분은 `male`, `female`입니다. 인물 그림을 위한 메타데이터이며 행동 능력이나 판정 조건을 변경하지 않습니다.

외형은 공간 배치와 별도의 시드 난수로 선택하므로 외형 추가가 기존 위치·인원·통로를 바꾸지 않습니다. 한 게임의 종업원끼리, 손님끼리, 두 계산원끼리는 각각 외형이 중복되지 않습니다. 계산원은 매장 종업원이 쓰지 않은 외형을 먼저 사용합니다. 종업원 3명과 계산원 2명이 모두 등장하면 총 5명에게 4개 종업원 외형을 적용하므로 1개 외형을 재사용합니다. v3에서 성인·노인·종업원·계산원의 실제 그림 높이는 플레이어와 같은 월드 86px로 맞췄고 어린이는 76%인 65.36px입니다. 발 기준 좌표는 유지하며, 충돌은 외형마다 측정한 신발 영역에 비례하는 바닥 사각형으로 바꿨습니다. `getMarketPersonGeometry`와 `getMarketPersonCollider`가 그림·그림자·물리 발판의 공통 기준입니다. 넓은 터치 영역을 충돌 박스로 해석하지 않습니다.

## 공간 버전과 이동 계약

기존 에피소드 리더와의 호환을 위해 환경·관측의 `schemaVersion:1`과 에피소드 `version:1`을 유지하며, 새 환경에는 `layoutVersion:3`을 명시합니다. 새 세션은 v3 공간을 생성합니다. 같은 seed·설정은 같은 버전에서 재현 가능하며, 공간 버전이 다르면 같은 seed도 좌표·충돌이 같다고 가정하지 않습니다. 과거 기록은 저장된 환경 스냅샷으로 해석해야 하고 과거 게임 상태를 새 엔진에서 직접 재개하는 기능은 없습니다. 기존 seed·환경 입력과 외형 카탈로그, 출처·판정·에피소드 데이터 규칙은 유지합니다. 12종 재고 생성은 분류별 `inventory-v2` 난수 스트림을 사용하므로 이전 9종 게임의 재고는 당시 저장된 스냅샷을 기준으로 읽습니다. `layoutId`가 없는 예전 설정은 기본 배치로, `entranceConstruction`이 없는 설정은 공사 없음으로 정규화합니다. 같은 버전 안에서도 조건과 생성 스냅샷을 함께 기록해야 이후 좌표 보완을 구별할 수 있습니다.

기본·가로 통로 지점의 월드는 **1100×1500**입니다. `walkableAreas`에는 메인 매장 `(310,80,740,960)`, 엘리베이터 별실 `(50,80,260,300)`, 서쪽 통로 `(120,340,190,700)`, 공동 로비 `(120,1020,930,424)`, 공동 문턱 `(620,1420,180,60)`이 있습니다. `walls`와 사람·가구 발판이 충돌을 결정하며 마트 플레이어 반경은 **12**입니다. 서쪽 판매장 벽 x286~310은 위쪽 문 y250~380을 제외하고 앞 경계 y1020까지 연결됩니다. 아래 판매장 입구 틈은 x410~550, 출구 경보기 틈은 x850~1010이며 그 아래 로비는 공동 문과 서쪽 복도로 연결됩니다. 계산 구역의 세로 구분벽 `(630,780,18,240)`은 입·출구가 난 y1020 경계에 붙습니다. 축소 계산대의 바닥 끝은 기존 y946을 유지합니다. 엘리베이터 두 대는 실제 뒤 벽과 연속 벽면에 붙습니다. `getMarketElevatorFacadeRect(objects,walls)`의 `(50,96,236,148)` 영역을 표시와 충돌에 함께 사용하고, 문 앞 y260 통행은 유지합니다. ATM 바닥은 `(130,880,60,70)`이며 80px 그림의 왼쪽 끝을 서쪽 벽 안쪽 x120에 붙입니다. 공용 로비 좌석은 `(165,1192,100,64)`, `(330,1192,100,64)`이고 작은 화분은 `(150,1320,28,30)`입니다. ATM·엘리베이터·휴게석·화분은 상호작용 station이 아닙니다.

| 필드 | v3 의미 |
| --- | --- |
| `spawn` | 기본·가로 통로 `(710,1350)`, 모퉁이 `(1060,1210)`: 각 외부 공동문에서 80px 안쪽 |
| `stations.entrance` | `(480,1030)`: 매장 내부 입구·아래 경보기 통행 표식 |
| `stations.exit` | `(930,1030)`: 매장 내부 출구·경보기 통행 표식 |
| `stations['common-door']` | `(710,1430)`: 외부로 나가는 실제 종료 상호작용 |
| `commonDoor` | `point`와 문 바닥 `gate:{x:620,y:1420,width:180,height:24}` |
| `exit` | 실제 외부 종료 좌표인 공동 출입문. `stations.exit`과 의미가 다름 |
| `alarmGates[]` | 안쪽 입구·출구·서쪽 문(모퉁이 지점은 동쪽 문) 경보기의 `id,gate,axis,boundary,rearm,outward` |
| `entrance` | 기존 리더용 안쪽 입구 별칭. 기본 감지선/재무장 Y는 1030/970, 모퉁이는 1050/990 |
| `constructionZones[]` | 공사 없음 `[]`. 공사 중 `id,gateId,rect,detourGateIds`로 닫힌 입구와 열린 우회문 명시 |
| `stationDetails[].available` | 공사 중 안쪽 entrance만 `false`. 생략되거나 `true`인 기존 목적지는 평소처럼 사용 |

`entrance`·`exit`는 가까이 지나가도 종료하지 않으며 최근접 행동 선택에서도 제외합니다. 입력 호환을 위해 이 두 ID에 가까이서 `interact`를 보내면 통행 표식 상호작용은 기록하되 열린 대상을 해제하고 쇼핑을 계속합니다. 실제 나가기는 `interact {station:'common-door'}`로 수행합니다.

`environment.checkouts`에는 두 계산대의 id, 바닥, 고객 접근점, 계산원 발 좌표·충돌·외형·초기 배치 여부가 있습니다. 1번은 바닥 `(720,829,48,117)`, 계산원 `(684,889)`, 고객 접근점 `(807,889)`입니다. 2번은 바닥 `(925,829,48,117)`, 계산원 `(889,889)`, 고객 접근점 `(1012,889)`입니다. 두 곳 모두 계산원은 왼쪽, 손님은 오른쪽이며 이전 64×156 바닥의 75%입니다. 첫 번째 계산대는 `environment.checkout` 별칭으로도 읽습니다.

동적 충돌은 `getMarketEnvironmentObstacles(environment, cashierAvailability)`를 사용합니다. 이전 boolean 두 번째 인자는 첫 번째 계산원 호출 상태로 해석합니다. `isMarketEnvironmentBlocked(environment, point, cashierAvailability)`는 구역 밖·벽·사람·집기를 검사합니다. 그림을 누르는 넓은 영역은 물리 충돌 영역과 별도입니다.

각 분류의 두 진열대는 `getMarketShelfUnitRects`가 반환하는 **110×64 바닥 두 개**를 각각 사용합니다. 세로 배치의 40px 간격은 통과할 수 있고 가로 배치의 22px 간격은 플레이어 지름 24px보다 좁아 통과할 수 없습니다. 분류 목적지는 하나지만 고정 접근점만을 중심으로 판정하지 않습니다. `getMarketRenderDepth(groundY)`는 `10 + Math.round(groundY)`를 반환합니다. 기둥·가구는 발판 바닥 Y, 인물은 발 Y를 사용하고, 세로 묶음의 두 진열대도 월드 안의 형제 레이어로 나누어 각각 정렬합니다. 캐릭터가 두 유닛 사이를 지나면 뒤 가구 앞이면서 앞 가구 뒤로 표시됩니다. 계산대 간판의 화면 글자는 `1`·`2`이며 접근성 이름은 전체 계산대 번호를 유지합니다.

| 함수 | 계약 |
| --- | --- |
| `getMarketStationDistance(env,id,position,cashierAvailability?)` | 가까운 실제 바닥 면까지 거리. 막힌 위치·벽/다른 집기/사람에 가린 면·계산대 직원 쪽은 `Infinity` |
| `isNearMarketStation(env,id,position,maxDistance?,cashierAvailability?)` | 유효 근접 판정. 진열대 64px, 계산대 60px, 공동 문 56px, 직원 및 통행 표식 88px 이내. 명시한 `maxDistance`가 더 작으면 그 값을 적용 |
| `getNearestMarketStation(env,position,cashierAvailability?)` | 현재 상호작용할 수 있는 가장 가까운 `MarketStationDetail` 또는 `null`. 내부 입구·출구는 후보에서 제외 |
| `getMarketStationApproachPoint(env,id,position,cashierAvailability?)` | 해당 대상의 가장 가까운 유효 접근점 또는 `null`. 이미 근접하면 현재 위치. 진열대 두 유닛의 열린 면을 모두 고려 |
| `getMarketNavigationPath(env,from,to,cashierAvailability?)` | 16px 격자의 제한된 A*와 연속 충돌 검사로 우회 경유점 생성. 시작점 제외·정확한 목적지 포함, 이미 도착 `[]`, 도달 불가 `null` |
| `isMarketNavigationSegmentClear(env,from,to,cashierAvailability?)` | 실제 플레이어 발판이 직선 구간을 통과하는지 검사. 경로 단순화에도 동일하게 사용 |

위 근접 함수는 `src/game/marketEnvironment.ts`, 경로 함수는 `src/game/marketNavigation.ts`에 있습니다. 모든 판단에 현재 `cashierAvailability`를 전달해야 새로 호출된 계산원이 반영됩니다. 경로 생성은 이동 허가나 순간 이동 행동이 아닙니다. 에이전트는 경유점을 따라 어댑터의 최대 32px `move`로 이동합니다. 지도 전체 구조가 관측되므로 이 보조 기능을 사용했다고 사람의 실제 시각 인지를 모사한 것으로 해석하지 않습니다.

기본 생성은 분류별 24종 중 서로 다른 12종을 골라 4열×3행 12칸에 SKU별 하나씩 배치합니다. 각 상품의 수량은 SKU 재고에서 읽습니다. 필수 상품과 유사 변형을 우선 포함하고 나머지를 무작위 선정합니다. 고정한 `inventoryProductIds`를 지정한 경우 필수 조건을 충족할 실제 재고가 있는지 검증합니다. 겹치는 품목군 조건, 잘못된 상품/위치, 부족한 재고 등의 불가능한 실험 설정은 조용히 바꾸지 않고 오류를 반환합니다.

### 모퉁이 지점과 공사 우회

모퉁이 지점의 월드는 **1280×1380**입니다. 판매장은 왼쪽 `(80,220,864,840)`, 엘리베이터 별실은 오른쪽 위 `(944,80,256,340)`, 서비스 복도는 동쪽 `(944,380,256,684)`, 공동 로비는 `(80,1040,1120,264)`입니다. 오른쪽 윙이 북쪽으로 돌출된 외벽을 실제 충돌 사각형으로 구성합니다. 기존 건물을 좌우 반전하거나 가구만 옮겨 표시하지 않습니다. 두 계산대는 `(200,870,48,117)`·`(405,870,48,117)`이며 여전히 직원은 왼쪽, 손님은 오른쪽입니다. 엘리베이터 바닥은 `(954,194,80,50)`·`(1084,194,80,50)`, ATM은 오른쪽 벽에 붙은 `(1130,900,60,70)`입니다.

안쪽 입구 `(730,1050)`와 출구 `(430,1050)`는 아래 공동 로비로 이어지고, 외부 공동문은 `(1060,1290)`에 있습니다. 동쪽 옆문은 y430~560, 감지선 x932이며 `east-door`, `axis:'x'`, `outward:1`, `rearm:875`로 기록합니다. 기본 지점의 `west-door`는 그대로입니다. 좌표를 직접 가정하지 말고 `getMarketLayoutStructure(layoutId)` 또는 생성된 환경을 읽습니다.

`entranceConstruction:true`일 때 기본·가로 통로 펜스는 `(410,1005,140,50)`, 모퉁이 펜스는 `(650,1025,160,50)`입니다. `constructionZones[0].rect`를 그림과 충돌에 같이 사용하여 문틈 전체를 막습니다. 관측의 entrance는 `available:false`, 근접 거리는 `Infinity`, 접근점은 `null`이고 상호작용과 물리 이동도 거부됩니다. 열린 우회문은 `detourGateIds`에 `exit` 및 `west-door`/`east-door`로 기록합니다. 공동문은 공사 조건에 영향을 받지 않습니다. 공사를 꺼도 시드·상품·사람이 다시 무작위로 바뀌지 않으며 펜스와 닫힘 상태만 해제됩니다.

회복 기능 `getMarketRecoveryPoint`는 모든 경보기의 같은 쪽을 유지합니다. 정상 위치에서는 경로가 벽·사람·공사 펜스를 통과하면 후보를 거부합니다. 이미 물체 안에 끼었을 때만 최초 연속 충돌 구역을 빠져나오며 그 이후 다른 장애물을 건너뛰지 않습니다. 미결제 물건이나 공사 조건을 회복 버튼으로 우회하지 못하도록 합니다. 실제 이동에서 누적되는 약 1e-12px 계산 오차만 처리하도록 충돌 비교에 1e-7px 허용 오차를 두며 실제 0.001px 침범은 여전히 막습니다.

실행 가능한 설정 예제는 [모퉁이 지점·입구 공사 JSON](examples/market-corner-construction.json)입니다. 설정 화면의 연구용 JSON에 그대로 가져올 수 있고, 시드·지점·공사 조건은 설정 재저장과 종료 에피소드에 보존됩니다.

## 관측과 행동

`runner.observe()`와 `runner.act()`의 반환값은 구매 목록의 표시명·필요 수량, 지도와 사람/오브젝트, 현재 위치/상호작용, 시도 횟수, 현재 단계, 공개된 결과를 포함합니다. 상품 목록·진열칸·재고는 현재 접근하여 열어 본 진열대만 반환합니다. 장바구니는 `viewCart`로 직접 열었을 때, 가까운 종업원과 대화 중일 때(`shopping` + `view:'world'`), 구매 결정 화면, 최종 종료 화면에서 반환하고 나머지 단계에서는 `null`입니다. 종업원 대화에서는 반납할 상품 ID와 수량을 선택할 수 있도록 장바구니를 공개하지만 다른 진열대의 상품 목록이나 재고를 공개하지 않습니다. 첫 실패 결과창에서도 자동으로 장바구니를 펼쳐 주지 않습니다. 품목군 과제의 내부 기준 SKU, 판정 세부값, 연구용 이벤트는 관측에서 제외합니다. 지도 전체의 위치 정보는 읽을 수 있는 구조화된 관측이므로 실제 사람 화면의 시야·글자 인지·기억 제한을 모사하는 시각 에이전트 환경은 아닙니다.

| 행동 | 조건과 효과 |
| --- | --- |
| `move {dx,dy}` | 한 번에 최대 32px. 경로를 작은 간격으로 검사하여 벽/진열대/사람/오브젝트를 통과할 수 없음 |
| `interact {station}` | 위 근접·가림 조건을 만족해야 함. `fresh`, `produce`, `household`, `meal`, `drink`, `checkout`, `checkout-2`, `staff:employee-1` 등. `common-door`에서 나가면 포기로 종료. `entrance`·`exit`는 내부 통행 표식으로 쇼핑을 계속함 |
| `add {productId,quantity?}` | 해당 진열대에 접근하여 상호작용한 뒤 담기. 기본 1개 |
| `remove {productId,quantity?}` | 쇼핑 중 해당 상품 진열대에 가까이 가서 상호작용한 상태에서만 직접 내려놓기. 진열대 안의 장바구니 펼침은 허용. 기본 1개 |
| `requestReturn {productId,quantity?}` | 쇼핑 중 가까운 종업원과 대화를 연 상태(`view:'world'`)에서 선택한 상품 반납을 요청. 기본 1개, 수량 1~99이며 담은 수량을 초과할 수 없음 |
| `closeStation` | 진열대 또는 계산 화면을 닫고 쇼핑으로 돌아가기 |
| `viewCart` | 장바구니를 직접 열어 담은 물품과 수량 확인. `cart_viewed` 기록 |
| `viewHelp` | 이용 방법 보기. `help_viewed` 기록 |
| `closeView` | 장바구니·도움 화면 닫기. `view_closed` 기록 |
| `checkout {checkoutId?}` | 해당 계산대에 가까이 있을 때 구매 결정 단계 열기. 기본 `checkout`. 아직 판정하지 않음 |
| `requestCashier` | 쇼핑 중 가까운 직원과 대화를 연 상태에서 한 번 요청. 두 계산대가 모두 비어 있을 때만 1번 계산대에 계산원 한 명을 배치. 이미 한 곳 이상에 계산원이 있으면 이용할 계산대를 안내하고 별도 감점 |
| `submit` | 계산원이 있는 계산대에서 최종 결정. 이때만 시도 횟수를 1 증가 |
| `retry` | 실패 결과 후 장바구니를 유지하고 쇼핑 재개 |
| `giveUp` | 진행 중 어느 단계에서든 종료. 제출 횟수를 늘리지 않음 |
| `rate {difficulty,interest}` | 종료 후 각각 1~5점. 난이도는 1 매우 쉬움~5 매우 어려움, 흥미는 1 재미없음~5 매우 재미있음 |
| `skipRating` | 종료 후 별점 없이 마무리 |

계산대 두 곳을 확인한 뒤 모두 비어 있을 때 직원 접근 지점에서 `interact`로 대화를 열고 `requestCashier`를 선택합니다. 목적 계산대를 다시 묻지 않으며 항상 1번(`checkout`)에 한 명을 배치합니다. 한 곳이라도 이미 운영 중이면 직원을 더 배치하지 않고 해당 계산대를 이용하도록 안내하며 `cashierRequestPenaltyPoints`만큼 감점합니다. 이 정상 대화 결과의 `lastActionError`는 `null`입니다. 직원에게 가까이 가지 않았거나 대화를 열지 않은 요청, 장바구니·도움·결제·결과 화면의 요청은 `action_rejected`만 남기고 감점하지 않습니다. 반납 도움은 계속 무료입니다.

`cashierAvailability`는 `{checkout:boolean,'checkout-2':boolean}`이며 두 계산대의 현재 배치를 각각 기록합니다. `selectedCheckoutId`는 마지막 선택/수락된 호출의 계산대이고, 호환용 `cashierAvailable`은 선택한 계산대(없으면 첫 번째)의 상태입니다. 추가 직원이 필요한지 판단할 때는 이 단일 별칭 대신 두 계산대의 `cashierAvailability`를 확인해야 합니다. 빈 계산대에서는 결제할 수 없으며 다른 계산원이 있으면 그 계산대를 이용하도록 안내합니다.

이전 에이전트의 선택 필드 `requestCashier.checkoutId`는 알려진 두 ID에 한해 가져오기를 허용하지만 목적지 선택 기능은 폐기했습니다. 생략하거나 어느 ID를 보내도 수락 목적지는 1번으로 같고, 제공한 값은 이벤트의 `legacyRequestedCheckoutId`에만 기록합니다. 없는 계산대 ID는 감점 없이 `action_rejected`로 처리합니다.

화면은 직원 응답 직후 요청 선택지를 숨기고 동일한 버튼 입력의 빠른 중복 처리를 막습니다. 대화를 다시 열거나 에이전트가 명시적으로 새 `requestCashier` 행동을 보내는 경우는 별도 요청이므로 운영 중인 계산원이 있으면 다시 감점할 수 있습니다. 세션 엔진은 전송 재시도의 식별 키나 중복 제거를 제공하지 않으므로 외부 실행기도 한 의도에 한 행동만 전송해야 합니다.

진열대·대화·장바구니·도움 화면이 열려 있는 동안에는 이동할 수 없으며 해당 화면을 닫아야 합니다. 무인 계산대는 배치/충돌 오브젝트이며 계산 행동 대상이 없습니다.

진열대 안에서 장바구니를 펼치는 경우에는 해당 진열대 상품과 장바구니를 함께 관측하며, 같은 진열대의 상품을 계속 담거나 제자리에 내려놓을 수 있습니다. 다른 분류의 물건은 해당 진열대로 이동하여 내려놓아야 합니다. 일반 장바구니나 계산대에서 `remove`로 물건을 없앨 수 없으며, 도움 화면을 보는 동안에는 담기·내려놓기·직원 반납을 할 수 없습니다.

직접 되돌려 놓기 어렵다면 종업원 접근점으로 이동해 `interact {station:'staff:…'}`로 대화를 열고 `requestReturn`으로 선택한 상품과 수량을 요청합니다. 요청한 수량만 장바구니에서 빠지고 동일 SKU 진열 재고로 돌아갑니다. 상품을 모두 반납하면 장바구니에서 그 상품 ID를 제거합니다. 반납 도움은 점수나 구매 시도 횟수를 바꾸지 않으며 올바른 물건인지, 필요한 수량이 얼마인지를 알려 주지 않습니다. 대화만 열거나 반납 목록을 확인하는 행동은 물건을 바꾸지 않습니다.

담기·직접 반납의 `cart_changed`에는 `method:'shelf'`, 직원 반납에는 `method:'employee'`를 기록합니다. 반납의 `operation`은 모두 `remove`이며 `productId`, `categoryId`, `quantity`, 변경된 `cart`와 `stock`을 포함합니다. 직원 반납에는 `staffStation`도 포함하고 그 직전에 `return_help_requested` 이벤트로 요청한 종업원·상품·수량·플레이어 위치를 별도 기록합니다. 유효하지 않은 요청은 `action_rejected`만 남기며 장바구니와 재고를 바꾸지 않습니다.

첫 구매 실패는 `feedback: {success:false}`만 반환합니다. 두 번째 이후 실패부터 `details`에 다른 품목/수량을 알려 줍니다. 재시도하면 이전 결과를 지우며 횟수 제한 없이 계속할 수 있습니다. 목록에는 필요한 수량만, 장바구니에는 담긴 수량만 표시하고 계산 전에는 자동 성공률이나 정오표를 제공하지 않습니다.

화면 통합용 `applyMarketAction`에는 `setPosition`이라는 신뢰된 동기화 행동이 추가로 있습니다. 이는 기존 게임의 충돌 검사가 끝난 실제 플레이어 위치를 전달하는 용도입니다. AI 실행기에 노출하면 이동 우회가 되므로 `createMarketAgentAdapter`는 이 행동을 타입과 실행 시점 양쪽에서 차단합니다. 에이전트는 반드시 어댑터의 `move`를 사용합니다.

### 계산원 요청의 공개 응답과 이벤트

관측에는 `cashierRequestFeedback: {accepted, message, checkoutIds, penaltyPoints} | null`이 추가됩니다. 가까운 직원과의 대화에서 마지막 행동이 정상 계산원 요청일 때만 공개 안내문과 이용할 계산대 ID, 이번 실제 감점을 반환합니다. 수락이면 `accepted:true`, `checkoutIds:['checkout']`, 감점은 0입니다. 거절이면 운영 중인 계산대 ID 목록과 실제 차감액을 반환합니다. 그다음 다른 행동을 하면 `null`이 되며, 연구용 이벤트 전체나 숨겨진 상품 정답은 여전히 관측하지 못합니다.

| 이벤트 | 기록 내용 |
| --- | --- |
| `cashier_requested` | 두 계산대 모두 없는 경우의 수락. `staffStation`, `checkoutId:'checkout'`, `message`, `playerPosition`, 선택적 `legacyRequestedCheckoutId` |
| `cashier_request_declined` | 정상 요청이지만 계산원이 이미 있음. `reason:'cashier-already-available'`, `staffStation`, `availableCheckoutIds`, `requestedPenaltyPoints`(설정값), `delta`(실제 음수 차감 또는 0), 현재 `score`, 누적 `penaltyPoints`, `message`, `playerPosition`, 선택적 `legacyRequestedCheckoutId` |

어느 응답도 장바구니·재고·구매 시도 횟수·결제 여부·구매 판정을 바꾸지 않습니다. 거절은 계산원 배치, 선택 계산대와 경보 횟수도 유지합니다. 수락만 1번 계산대의 현재 배치와 선택 계산대를 갱신합니다. 이벤트는 종료 에피소드에 보존되고 설정은 JSON 저장·불러오기와 함께 재현됩니다.

## 출입 경보와 점수

점수는 100에서 시작합니다. 미결제 물품을 담고 아래 입구·출구 또는 서쪽 연결 문을 **판매장 밖 방향으로** 통과하면 기본 10점을 차감하고 `entrance_alarm`을 기록합니다. 감점은 기존 `alarmPenaltyPoints` 설정을 따릅니다.

| 경보기 ID | gate | axis / boundary | outward | rearm |
| --- | --- | --- | --- | --- |
| `entrance` | `{x:410,y:1010,width:140,height:40}` | `y / 1030` | `1`: y 증가 방향 | `970` |
| `west-door` | `{x:278,y:250,width:40,height:130}` | `x / 298` | `-1`: x 감소 방향 | `355` |
| `exit` | `{x:850,y:1010,width:160,height:40}` | `y / 1030` | `1`: y 증가 방향 | `970` |

`move`와 신뢰된 `setPosition`은 이전 위치와 새 위치를 잇는 선분이 실제 감지선 범위를 통과했는지 검사합니다. 기존 이벤트 이름 `entrance_alarm`은 유지하고 `gateId`로 `entrance`·`exit`·`west-door`를 구분하며 `trigger:'boundary-crossed'`, 설정 감점, 실제 점수 변화, 위치·장바구니·누적 경보를 기록합니다.

같은 선 주변의 작은 왕복에 중복 감점하지 않도록 통과 후 `alarmArmed`를 해제합니다. 모든 경보기의 안쪽 재활성화 조건을 만족하는 **x355 이상·y970 이하**의 판매장으로 충분히 복귀하면 다시 활성화됩니다. 공동 로비와 서쪽 바깥 복도의 이동 자체에는 감점하지 않습니다. 내부 출구의 경보선을 미결제 상품과 함께 나가는 경우는 입구·측면 출입문과 동일하게 감점합니다. 빈 장바구니와 결제된 장바구니에도 감점하지 않습니다. 내부 입구·출구 표식에 `interact`를 보내는 것만으로는 경보를 추가하거나 게임을 종료하지 않습니다.

`score`, `penaltyPoints`, `alarmCount`, `paid`는 세션·관측·종료 내보내기에 동일하게 들어갑니다. `alarmArmed`는 세션과 관측에 표시합니다. 점수는 0 아래로 내려가지 않으며 이벤트 `delta`는 설정값이 아니라 실제 점수 변화입니다. 예를 들어 35점에서 65점 경보가 발생하면 delta=-35이고 이후 경보는 delta=0입니다. 이 점수에는 출입 경보와 불필요한 계산원 요청의 실제 감점이 함께 반영됩니다. `penaltyPoints`는 두 사유의 누적 실제 차감 합계이고 `alarmCount`는 경보만 셉니다. 사유별 합계는 각 `entrance_alarm`과 `cashier_request_declined`의 `-delta`를 합산합니다. 계산원 요청 감점도 0점 하한을 따르며 상품 선택의 정답률을 미리 공개하지 않습니다. 최종 성공 결제 때 `paid:true`가 되고 종료 후 이동은 거부합니다.

## 종료 데이터와 연결 경계

`runner.exportEpisode()`는 성공 또는 포기로 종료된 후 JSON 호환 객체를 반환합니다. 진행 중에는 내보내기가 거부됩니다. 완료 자료에는 내부 구매 조건, 제출마다 전체 판정과 실제로 공개한 피드백, 재시도, 별점/건너뛰기와 환경이 모두 포함됩니다. 이를 다음 행동을 고르는 모델 입력으로 돌려보내지 않습니다.

일반 UI는 `source:'human'`을 사용합니다. AI 어댑터는 `source:'synthetic'`과 `agentModel`, `personaId`를 요구합니다. 합성 기록은 특정 장애인의 실제 행동이나 임상적으로 검증된 페르소나로 표시하지 않습니다. 다른 출처와 섞어 학습할 때도 이 구분과 페르소나 버전을 보존합니다.

서버 연결 시 수행할 남은 작업은 모델 관측/행동 변환, 모델·페르소나별 실행 반복 및 종료 제한, 에피소드 저장 API, 기존 분석 결과와의 식별자 연결입니다. 종료하지 않는 모델을 다루는 실행 시간·스텝 수 제한은 호출 측 실행기가 담당하고 제한 도달 시 `giveUp`과 수집 측 종료 사유를 남겨야 합니다.
