# 마트 그리드 배치와 JSON 인수인계

## 2026-11-13 GameEntry1 시작 화면

장보기 진입은 `MarketEntryScreen`의 단일 시작 화면을 사용한다. Figma 원본 카트와 메뉴를 적용하되, 배경 사진은 참고용이라는 사용자 지시에 따라 실제 마트 월드를 비춘다. 최신 지시로 흐림 효과와 관련 BlurTargetView를 제거하고 설정과 같은 어두운 배경(`rgba(31,42,34,0.65)`)을 사용한다. 시작 한 번으로 플레이에 들어가며 자세한 안내는 게임 안 이용 방법, 물품 목록은 기존 HUD에 유지한다. 시작 전 종료는 마을로 나가고 실패 기록을 만들지 않는다. 의뢰인의 예산과 모드·설정 제한은 유지한다. [전후 비교와 활동 기록](../../docs/reviews/market-entry-2026-11-13/README.md)을 확인한다.

후속 수정: 진입 배율과 카메라는 마트가 보이기 전 layout effect에서 함께 맞춘다. 설정·편집기 하단은 화면 크기에 관계없이 최소 54dp를 비우며, 기본 배율의 지도는 내부 ScrollView를 만들지 않아 설정 드래그를 가로채지 않는다. 카트는 436KB 표시용 PNG를 사용한다. 캐릭터는 카메라와 같은 Animated 노드로 위치를 계산하고, 최근 디코딩한 atlas 3개를 보관해 동작 전환 시 재사용한다. 자세한 원인과 검증 한계는 위 기록의 후속 수정 절에 정리하였다.

iOS 여백 재수정: KeyboardAvoidingView의 `padding` 동작이 자체 paddingBottom을 0으로 덮어쓰므로, 54dp 여백은 별도 내부 View(`market-settings-insets`)에 둔다. 키보드 회피와 디자인 여백을 독립적으로 유지한다. 연습/도전 메뉴는 외곽 212×52dp, 선택 버튼 100×40dp로 통일하여 상하·바깥쪽 간격이 모두 6dp다.

## 2026-11-13 Sett1~Sett6 스타일 적용

현재 설정 탭은 **기본 설정 / 상황 설정 / 세이브 · 로드**, 편집기 탭은 **그리드 편집 / 테스트 / 보관함**이다. 파일 처리는 11월 12일의 통합 계약을 유지한다. ‘직접 배치 편집’ 카드와 ‘구조 및 배치’ 펼치기를 사용하며, 편집기에서는 좌표 조작을 먼저 표시하고 팔레트·추가 도구를 ‘목록 보기’에 보관한다. 테스트 탭의 ‘실제 전경’과 ‘인게임 테스트’는 기존 독립 미리보기·걸어보기를 호출한다.

사용자 후속 피드백에 따라 바깥 배경은 초록 단색이 아닌 **기존 게임이 어둡게 비치는 배경**이며, 화살표에도 초록 바탕을 넣지 않는다. 긴 내용은 패널 안에서 스크롤하고, 남은 내용이 있는 방향에만 부드러운 가장자리 페이드를 표시한다. 하단 ‘뒤로가기’·‘설정 적용/편집 완료’는 스크롤 바깥에 고정한다. 탭의 선택 표시와 내용은 슬라이드·지연 없이 제자리에서 즉시 바뀐다. 화면 진입·펼치기 모션은 유지하며, 모션 감소 시 즉시 전환한다.

색상·폰트·간격은 사용자 Figma와 제공 PNG를 기준으로 한다. 게임 규칙은 유지했으므로 시안에만 있는 반전 도면과 출구 공사 동작은 추가하지 않았다. [두 작업을 합친 활동일지·변경 전후 원본](../../docs/reviews/market-settings-2026-11-13/README.md)을 확인한다.

## 2026-11-12 설정 메뉴 통합

현재 진입 이름은 시작 전과 휴대폰 설정 모두 **마트 설정**이다. 한 메뉴의 **마트 배치 / 연습 조건 / 저장·불러오기** 세 탭에서 편집한다. 아래 2026-10-17 기록의 별도 JSON 메뉴와 ‘연습 환경 설정’ 명칭은 이전 화면 설명이다.

- **마트 배치:** 배치 편집·보관함·실제 모습·걸어보기를 사용한다. 자동 배치와 시설 옵션은 접어서 표시한다. 직접 배치를 기본/랜덤 배치로 바꿀 때 확인하며, 저장한 보관함 항목은 유지한다.
- **연습 조건:** 상품 판정·품절·예산·재고·계산 실수 조건을 설정한다. 감점 수치는 별도 펼치기로 제공한다.
- **저장·불러오기:** 전체 설정과 배치 JSON을 한곳에서 자동 구분해 읽는다. **전체 설정 저장**은 구매 조건과 `environment.tilemap`을 함께, **배치만 저장**은 기존 배치 스키마만 내보낸다. 웹은 파일 열기/다운로드, 네이티브는 붙여넣기/공유를 사용한다.
- 그리드의 **편집 완료**는 메뉴의 초안에 반영한다. 하단에 고정된 **설정 적용**으로 전체를 적용한다. 편집기에서 **저장·불러오기**로 이동해도 새 배치는 초안에 포함되며, 중복 JSON 탭은 표시하지 않는다.
- 플레이 중에도 같은 메뉴를 사용하되, 시설·연습 조건은 바꾸지 않는다. 전체 설정 파일을 읽어도 그 안의 **배치만** 추출한다고 안내한다. 최종 **배치 적용**은 기존 `replaceMarketSessionTilemap` 경로를 사용하므로 장바구니·재고·점수·기록과 호출한 계산원을 유지한다.
- 가져오기 실패는 현재 초안을 덮어쓰지 않는다. 붙여 넣은 입력은 탭을 이동해도 유지한다. 인테리어 선택은 기존 테마 설정 동작을 유지하며 JSON 저장 대상에는 포함하지 않는다.

동일한 375×812 브라우저 화면의 실제 변경 전/후 캡처와 활동일지 문장은 [비교 기록](../../docs/reviews/market-settings-2026-11-12/README.md)에 있다. Expo Go 실기기 확인과 브라우저 검증을 구분한다.

작성 기준: **2026-10-17 (한국 시간)**. 프론트엔드 `feat/8-시뮬레이션-게임-ui-제작` 작업이다. 기존 장보기의 상품·대화·결제 규칙을 유지하면서 진열대, 종업원, 손님의 위치를 직접 정하는 기능이다.

## 1. 기존 JSON과 이번 배치 JSON

장보기에는 이미 [실험 설정 JSON](market-environment.example.json)을 읽고 저장하는 기능이 있었다. 기존 `environment.layoutId`, `shelfOrder`, 인원 수, `employeeSlotIds` 등의 값은 **미리 만든 매장 구조와 후보 위치**에서 배치를 결정했다.

이번에는 `environment.tilemap`에 그리드 좌표를 담는다. 같은 파일을 다시 가져오면 같은 진열대·인물 위치로 매장을 구성한다. 화면을 만들 때 사용하는 좌표, 충돌, 상호작용 목적지, AI 실행기에 전달하는 환경 스냅샷 모두 이 배치에서 파생된다.

| 파일 종류 | 담는 내용 | 용도 |
| --- | --- | --- |
| 배치 JSON | `format`, `version`, 기반 매장, 그리드 크기, 진열대·인물의 위치와 외형 | 같은 공간을 다른 장보기 과제에 재사용 |
| 전체 장보기 설정 JSON | `seed`, 구매 목록, 재고, 학습 조건, `environment.tilemap` 등 | 공간과 과제 조건을 함께 전달 |
| 종료 에피소드 JSON | 실제 생성된 환경, 과제, 행동·결과·출처 | 끝난 플레이의 분석·재현 근거 |

서버에서 배치를 받거나 서버에 저장하는 API는 이번 작업에 연결하지 않는다. 기기 안의 보관함과 로컬 파일/텍스트 가져오기·내보내기를 사용한다. 다른 팀원이 서버 연동을 만들 때 아래 파서와 전체 설정 계약을 사용할 수 있다.

## 2. 편집 범위

- 과일·채소, 냉장식품, 생활용품, 간편식품, 음료의 **진열대 묶음 다섯 개**를 이동한다.
- 각 분류는 하나의 묶음이며, 실제 그림은 두 진열대다. `horizontal`은 두 개를 가로로, `vertical`은 세로로 배치한다. 그림 자체를 90도로 눕히는 회전이 아니다.
- 종업원 **1~3명**, 손님 **0~5명**의 위치와 외형을 지정한다. 직원에게 묻기·계산원 요청·상품 반납 도움을 위해 종업원 한 명은 필요하다.
- 기본 배치(`classic`), 가로 통로 배치(`aisles`), 모퉁이 지점(`corner`)의 건물 구조를 바탕으로 편집한다.
- 벽, 바닥 영역, 출입구·경보기, 계산대·키오스크, ATM·엘리베이터·휴게 가구는 기반 매장의 시설이다. 이번 편집에서 옮기거나 삭제하지 않는다. 계산원 수, 키오스크 줄, 입구 공사 등 기존 설정은 그대로 사용한다.

가구를 놓는 그리드이며, 타일 하나마다 새 바닥 그림을 칠하는 범용 맵 제작기는 아니다. Tiled 편집기의 TMX/JSON 또는 게임 엔진 공용 타일맵 형식을 그대로 가져오는 기능도 포함하지 않는다.

## 3. 화면에서 사용하기

### 마트 안에서 바로 편집

마트에서 **휴대폰 → 설정 → 마트 배치 편집**으로 연다. 전화창이 닫힌 뒤 그리드 편집기가 열린다. 장을 보는 중에는 대화·상품 선택·계산 화면을 닫고 사용한다. 계산을 끝낸 상태에서는 배치를 바꾸지 않는다.

이 경로의 **배치 적용**은 매장에 바로 반영한다. 장바구니, 남은 재고, 구매 목표, 학습 진행과 점수·기존 기록을 보존하며 캐릭터만 새 배치의 안전한 입구 시작점으로 옮긴다. 계산원을 불러 둔 상태도 보존한다. 취소하면 진행 중인 매장은 그대로다. 아래의 시작 전 환경 설정과 달리 두 번째 **설정 적용**은 필요 없다.

### 장보기 시작 전 환경 설정

1. 일반 장보기 시작 화면에서 **연습 환경 설정 → 그리드로 직접 배치**를 누른다. 이미 수동 배치가 있으면 **그리드 배치 수정**으로 표시된다.
2. **그리드 편집**에서 진열대나 사람을 목록에서 선택하고 지도에서 놓을 칸을 누른다. 한 칸 이동 버튼이나 행·열 입력으로도 위치를 조정할 수 있다. 진열대 방향 변경, 사람 추가·삭제·외형 변경을 지원한다.
3. 통로·충돌 검사 메시지를 확인한다. **배치 실행 취소**로 직전 변경을 되돌리거나 **편집 전 배치로** 돌아갈 수 있다.
4. **배치 적용**으로 환경 설정 화면에 돌아간 뒤, **설정 적용**을 눌러 실제 매장을 갱신한다. 두 버튼은 각각 편집 초안과 게임 설정을 확정하는 역할이다. **취소**는 게임에 배치를 적용하지 않는다.
5. 목록을 확인하고 장보기를 시작한다.

민수에게 부탁받아 예산이 연결된 장보기는 기존대로 전체 환경 설정 진입을 숨긴다. 위 경로는 일반 장보기의 시작 전 설정이다. 휴대폰의 배치 편집은 구매 조건을 바꾸지 않는 별도 경로다. 개발 웹에서는 `?marketLab=1`로 장보기 설정과 매장을 확인할 수 있다.

### JSON으로 주고받기

**JSON 가져오기** 탭에서는 배치 전용 JSON을 붙여 넣고 **붙여 넣은 배치 불러오기**를 누른다. 웹에는 **JSON 파일 열기**도 있으며 1MB 이하 파일을 고른다. 파일 크기와 별개로 배치 파서의 텍스트 길이 제한도 적용된다. 불러온 뒤 지도와 오류를 확인하고 **배치 적용**을 누른다. 시작 전 환경 설정에서 열었을 때만 이어서 **설정 적용**을 누른다.

**JSON 저장**은 웹에서 배치 파일을 내려받고, 네이티브 앱에서는 JSON 텍스트 공유 창을 연다. 전체 구매 조건까지 함께 전달하려면 환경 설정 화면의 **설정 JSON 저장**을 사용한다. 네이티브 파일 선택기는 이번에 추가하지 않았으며, 모바일 앱에서는 텍스트 붙여넣기와 공유를 사용한다.

적용한 설정은 해당 장보기의 설정이다. 다음 마트 입장에 자동 적용되지는 않는다. 다시 사용하려면 **보관함**에서 꺼내거나 JSON을 가져온다. 배치 파일만 가져오면 기둥 수·공사·계산대 구성은 가져오는 쪽의 환경 설정을 사용하므로, 당시 환경 전체까지 재현하려면 전체 설정 JSON을 사용한다.

### 이름을 붙여 보관하기

**보관함 → 새 배치 이름 → 새로 저장**으로 현재 편집 배치를 보관한다. 최대 24개, 이름은 Unicode 문자 기준 32자다. 각 카드에는 실제 저장 좌표로 그린 작은 도면과 기반 매장·인원·수정 시각이 표시된다. 작은 도면은 이동 가능한 진열대·인물과 기반 구조를 보여 주며, 저장하지 않는 기둥 등 현재 과제의 고정 시설은 그려 넣지 않는다.

- **불러오기**는 편집 초안만 교체한다. 그리드나 실제 모습을 확인한 뒤 **배치 적용**을 눌러야 진행 중인 게임에 반영된다.
- **관리**에서 이름 변경·복제·현재 배치로 덮어쓰기·삭제를 사용한다. 덮어쓰기와 삭제에는 별도 확인 버튼이 있다.
- 저장·불러오기 실패 시 기존 저장 내용과 편집 초안을 유지한다. 다른 과제의 공사·기둥·계산원 위치에 걸리는 배치는 오류를 표시하고 불러오지 않는다.
- 저장 대상은 `MarketTilemapV1`이다. 장바구니, 점수, 구매 목표, 테마, 기둥 배치, 게임 진행을 저장하는 기능이 아니다.

웹은 해당 사이트 주소의 `localStorage`, Expo Go/iOS/Android는 앱 문서 디렉터리의 파일에 보관한다. 앱을 다시 열어도 보관함은 남지만, 앱 삭제·앱 데이터 삭제·브라우저 사이트 데이터 삭제 후에는 복구되지 않는다. 다른 기기로 옮길 때는 JSON을 내보낸다.

웹의 동시 저장은 Web Locks로 전체 읽기–수정–쓰기를 보호한다. `localhost` 또는 HTTPS의 지원 브라우저에서 저장할 수 있다. 잠금 기능이 없는 환경은 읽기를 허용하고 저장 오류와 JSON 내보내기 안내를 표시한다. 네이티브는 임시 파일을 검증한 뒤 새 스냅샷 파일로 옮기고 이전 스냅샷을 보존한다. 손상된 최신 파일을 빈 보관함으로 간주해 덮어쓰지 않는다.

### 실제 모습과 걸어보기

**그리드 편집 → 실제 모습**은 실제 게임의 진열대·인물·시설 그림으로 전체 매장을 보여 준다. 확대 버튼과 스크롤로 구석을 확인할 수 있다. 테마 버튼은 미리보기 안의 그림만 바꾼다. 실제 게임의 테마 설정은 그대로 유지한다.

**여기서 걸어보기**는 현재 편집 배치의 독립된 테스트 공간이다. 기존 공통 이동 패드, 캐릭터 크기, 충돌, 깊이 정렬, 카메라를 사용하고 웹에서는 WASD/방향키·Shift 달리기를 지원한다. **입구로**는 테스트 캐릭터를 시작 위치로 돌린다. 상품 구매·대화·점수·실제 캐릭터 위치에 영향을 주지 않는다.

**편집으로 돌아가기**, Escape 또는 Android 뒤로 가기로 편집 초안과 실행 취소 이력을 유지한 채 돌아온다. 움직임 입력·애니메이션 루프는 화면을 닫거나 앱 포커스를 잃을 때 정리한다. 잘못된 배치는 실제 모습과 걸어보기를 열기 전에 검증한다.

## 4. 좌표와 스키마

좌표 원점은 **선택한 마트 월드의 왼쪽 위 `(0, 0)`**다. `col`은 오른쪽, `row`는 아래로 증가하고, 모두 **0부터 시작하는 정수**다. 한 칸은 월드 좌표 **20×20**이다. 휴대폰 화면 픽셀이나 화면 확대 배율을 저장하지 않는다.

```ts
worldX = (col + 0.5) * 20;
worldY = (row + 0.5) * 20;
```

예를 들어 `col:24, row:11`의 중심은 `(490, 230)`이다. 진열대에서는 **묶음 바닥 사각형의 중심**, 사람에서는 **발 기준점**을 의미한다. 진열대 그림의 왼쪽 위 좌표와 혼동하면 안 된다. 충돌 크기와 그림 배율은 기존 `marketFixtureLayout.ts`, `marketPersonLayout.ts`를 따른다.

편집 화면의 행·열 입력은 사용자가 세기 편하게 **1부터** 표시한다. 화면의 가로 25칸·세로 12칸은 JSON의 `col:24, row:11`이다.

| 필드 | 규칙 |
| --- | --- |
| `format` | `"oneuldo.market-layout"` |
| `version` | `1` |
| `layoutId` | `"classic"`, `"aisles"`, `"corner"` |
| `cellSize` | `20` |
| `shelves` | 아래 다섯 `categoryId`를 각각 한 번 포함 |
| `shelves[].categoryId` | `produce`, `fresh`, `household`, `meal`, `drink` |
| `shelves[].col`, `row` | 지도 범위 안의 0 이상 정수 |
| `shelves[].orientation` | `"horizontal"` 또는 `"vertical"` |
| `people` | 종업원 1~3명, 손님 0~5명 |
| `people[].id` | 영문자로 시작하는 48자 이내 영문·숫자·밑줄·하이픈. 사람끼리 중복 금지 |
| `people[].kind` | `"employee"` 또는 `"customer"` |
| `people[].col`, `row` | 사람의 발이 놓일 칸 |
| `people[].appearance` | 해당 종류의 외형 카탈로그 인덱스. 종업원 0~3, 손님 0~11 |

외형 인덱스의 순서는 [marketPeople.ts](../src/game/marketPeople.ts)에 있다. 런타임 환경에는 기존처럼 명시적 `appearanceId`도 함께 기록한다. 외형 선택이 행동 능력이나 난이도를 바꾸지는 않는다.

`classic`·`aisles`는 1100×1500 월드, `corner`는 1280×1380 월드다. 그리드 행·열 수는 `getMarketTilemapGrid(layoutId)`로 구한다. 좌표가 격자 안에 있더라도 건물 밖이거나 가구의 바닥이 벽과 겹치면 적용할 수 없다.

### 실행 가능한 예제

- [배치 전용 JSON](examples/market-tilemap-layout.json): 기존 기본 배치에서 과일·채소와 냉장식품 위치를 맞바꾸고, 종업원 위치를 조정한 2명·손님 1명 예제다. 그리드 편집기의 JSON 가져오기에 넣는다.
- [전체 설정 JSON](examples/market-tilemap-session.json): 위 배치와 구매 목록·기둥 0개·계산원 2명·유인 계산대 두 줄 등의 설정을 묶었다. 환경 설정의 연구용 상세 JSON에 넣는다. 확인하기 쉬운 예제로 품절·추가 음료 선택·계산 실수를 껐다. 일반 게임의 기본 정책을 변경한 것은 아니다.

배치 전용 파일의 형식은 다음과 같다.

```json
{
  "format": "oneuldo.market-layout",
  "version": 1,
  "layoutId": "classic",
  "cellSize": 20,
  "shelves": [
    { "categoryId": "produce", "col": 43, "row": 11, "orientation": "horizontal" },
    { "categoryId": "fresh", "col": 25, "row": 11, "orientation": "horizontal" },
    { "categoryId": "household", "col": 20, "row": 25, "orientation": "vertical" },
    { "categoryId": "meal", "col": 32, "row": 25, "orientation": "vertical" },
    { "categoryId": "drink", "col": 45, "row": 25, "orientation": "vertical" }
  ],
  "people": [
    { "id": "staff-help", "kind": "employee", "col": 39, "row": 36, "appearance": 3 },
    { "id": "staff-north", "kind": "employee", "col": 50, "row": 17, "appearance": 1 },
    { "id": "customer-1", "kind": "customer", "col": 10, "row": 40, "appearance": 5 }
  ]
}
```

전체 설정 예제의 `startedAt`은 재현용 기본 시각이다. 실제 플레이 시각이나 수집된 사용자 기록을 뜻하지 않는다. UI에서 게임을 시작할 때 실제 시작 시각을 새로 넣는다.

## 5. 입력 검증과 적용 시점

시작 전 전체 환경 설정은 기존처럼 새 장보기 시도를 만들 때 적용한다. 휴대폰으로 연 배치 편집은 진행 중인 세션에서 **공간만** 바꾼다. `replaceMarketSessionTilemap`은 `shopping` 단계·`world` 화면·열린 상호작용 없음·미결제 상태를 검사하고, 새 배치 검증이 모두 끝나야 교체한다. 거절되면 기존 세션과 기록에 변경을 남기지 않는다.

진행 중 교체는 `layout_changed` 이벤트에 이전 배치, 새 배치와 전체 환경, 이동 전후 캐릭터 좌표, 계산원 호출 상태를 기록한다. `session_started`의 최초 환경 기록도 남으므로 보고서·재현 도구는 배치 변경 이벤트를 함께 읽어야 한다. 변경을 새 장보기 완료나 보상으로 취급하지 않는다.

검증은 두 단계다.

1. **형식:** JSON 문법, 지원 버전, 알 수 없는 필드, 분류·인물 ID 중복, 정수가 아닌 좌표, 인원과 외형 범위를 검사한다. 배치 JSON 텍스트는 48,000자 이내다.
2. **실제 공간:** 벽·고정 시설·다른 인물·다른 진열대와 바닥이 겹치는지, 시작점과 출입구가 막히는지, 실제 플레이어 크기로 진열대·직원·계산대까지 이동할 수 있는지 검사한다.

계산원이 처음에는 없어도 나중에 호출될 수 있으므로 계산원의 발 위치를 비워 둔다. 자동 길 찾기에서 출구로 역진입하지 않는 기존 규칙도 유지한다. 화면상 틈이 있더라도 플레이어의 발판이 지나갈 수 없으면 적용이 거부될 수 있다. 오류 메시지에 나온 대상을 옮기거나 통로를 넓힌다.

그리드 편집 좌표는 20 단위, 이동 경로 탐색은 기존 16 단위 샘플과 연속 충돌 검사다. 둘은 서로 다른 역할이다. 플레이어가 이동할 때 격자 칸으로 순간 이동하지 않는다.

## 6. 코드에서 읽는 방법

```ts
import { createMarketSession } from '../src/game/marketSession';
import {
  applyMarketTilemapToConfig,
  parseMarketTilemapJson,
} from '../src/game/marketTilemap';

const current = createMarketSession({ seed: 'my-market' });
const tilemap = parseMarketTilemapJson(fileText);
const config = {
  ...current.config,
  environment: applyMarketTilemapToConfig(current.environment.config, tilemap),
};
const next = createMarketSession(config);
// next.environment는 렌더링·충돌·상호작용에 사용할 검증된 환경이다.
```

전체 장보기 설정은 기존 `parseMarketSessionConfig(text)`로 읽는다. 배치 파일을 이 함수에 직접 전달하지 않고, 배치 파서 또는 UI의 배치 가져오기를 사용한다.

진행 중 장보기의 공간만 바꿀 때는 `marketSession.ts`의 `replaceMarketSessionTilemap(currentSession, tilemap, at?)`을 사용한다. 위 예제처럼 `createMarketSession`으로 다시 만들면 장바구니·진행이 초기화되므로 플레이 중 편집에서는 사용하지 않는다.

배치를 적용하면 `layoutId`와 실제 인원 수가 `tilemap`에 맞게 동기화되고 기존 인물 후보 슬롯 선택은 해제된다. 진열대 위치는 `tilemap.shelves`가 우선한다. 구매 목표·재고·학습 조건·출처는 전체 세션 설정에 남는다. 런타임 `environment.shelves`는 분류별 사각형/접근점, `employees/customers`는 실제 발 좌표/충돌 사각형, `stationDetails/stations`는 상호작용 지점, `obstacles`는 충돌 목록이다.

## 7. 수정할 파일

| 대상 | 파일 |
| --- | --- |
| 스키마·파서·좌표 변환·검증 | [marketTilemap.ts](../src/game/marketTilemap.ts) |
| 그리드 편집·배치 JSON 입력/출력 | [MarketLayoutEditor.tsx](../src/components/game/MarketLayoutEditor.tsx) |
| 보관함 UI·도면 카드 | [MarketLayoutLibrary.tsx](../src/components/game/MarketLayoutLibrary.tsx), [MarketLayoutThumbnail.tsx](../src/components/game/MarketLayoutThumbnail.tsx) |
| 보관함 계약·기기 저장 | [marketLayoutStore.ts](../src/game/marketLayoutStore.ts), `marketLayoutStorage.web.ts`, `marketLayoutStorage.native.ts`, `marketLayoutStorage.file.ts` |
| 실제 모습·독립 이동 테스트 | [MarketLayoutPreview.tsx](../src/components/game/MarketLayoutPreview.tsx), [MarketThemePreviewContext.tsx](../src/components/game/MarketThemePreviewContext.tsx) |
| 기존 환경에 수동 배치 적용 | [marketEnvironment.ts](../src/game/marketEnvironment.ts) |
| 전체 게임 설정과 에피소드 계약 | [marketSession.ts](../src/game/marketSession.ts) |
| 시작 전 설정 진입 | [MarketSetupPanel.tsx](../src/components/game/MarketSetupPanel.tsx) |
| 휴대폰 설정 진입 | [PhoneSettings.tsx](../src/components/game/PhoneSettings.tsx), [GameHud.tsx](../src/components/game/GameHud.tsx) |
| 실제 장보기 화면·환경 재적용 | [MarketSimulationScreen.tsx](../src/screens/MarketSimulationScreen.tsx) |
| 마을에서의 마트 진입·카메라 | [GamePrototypeScreen.tsx](../src/screens/GamePrototypeScreen.tsx) |
| 실제 바닥 크기·사람 발판 | [marketFixtureLayout.ts](../src/game/marketFixtureLayout.ts), [marketPersonLayout.ts](../src/game/marketPersonLayout.ts) |
| 길 찾기 | [marketNavigation.ts](../src/game/marketNavigation.ts) |

기존 환경의 `schemaVersion:1`과 `layoutVersion:3`, 배치 파일의 `version:1`은 다른 필드다. 배치 파일에는 필요한 저작 데이터만 담고, 런타임 충돌 목록이나 이미지 경로를 외부 JSON에서 임의로 주입하지 않는다.

## 8. 검증 근거와 이어서 확인할 것

두 예제 파일은 현재 프론트엔드의 실제 파서와 `createMarketSession`으로 읽고, 충돌·접근 가능 여부 검증을 통과한 뒤 저장했다. 전체 설정 JSON을 다시 읽어 생성한 환경이 최초 환경과 같은지도 확인했다. 예제 매장에서 계산대 2곳, 공동 출입문, 진열대 5곳, 종업원 2명까지 기존 길 찾기 경로를 따라 12 단위 이하의 실제 `move` 행동으로 이동한 결과 이동 오류 없이 100점·출구 역진입 0회를 유지했다. 이 확인은 코드 실행 결과이며, Expo Go 실기기 조작 확인을 뜻하지 않는다.

관련 회귀 테스트는 `__tests__/marketTilemap.test.ts`, `__tests__/MarketLayoutEditor.test.tsx`, `__tests__/MarketLayoutEditorExperience.test.tsx`, `__tests__/MarketLayoutSetupFlow.test.tsx`, `__tests__/MarketLayoutInGameFlow.test.tsx`, `__tests__/MarketLayoutLibrary.test.tsx`, `__tests__/MarketLayoutPreview.test.tsx`, `__tests__/marketLayoutStore.test.ts`, `__tests__/MarketSetupPanel.test.tsx`, `__tests__/GameHud.test.tsx`다. 형식 오류, 잘못된 배치, JSON 왕복, 0명 손님, 기존 기본 배치 복귀, 편집 취소와 적용, 진행 보존, 보관함 재시작·저장 실패·동시 저장, 미리보기 격리와 입력 정리를 확인한다. 전체 실행 결과는 실제 수행한 명령과 결과를 최종 작업 보고에 기록한다.

네이티브에서 작은 화면 확대·스크롤·칸 선택, 키보드가 열린 좌표/JSON 입력, 공유 창과 실제 앱 재시작 후 보관함 동작은 실기기에서 별도로 확인한다. iOS 번들 검증이나 모의 파일 저장 테스트가 실기기 검증을 대신하지 않는다. 자동 적용이나 서버 동기화를 추가할 때는 그 범위와 저장 위치를 이 문서에도 갱신한다.

2026-10-17 보관함·미리보기 추가 검증: 관련 8개 테스트 묶음 **68개 통과**, `pnpm typecheck`와 `pnpm build:web` 통과. 실행 중 Metro의 iOS manifest에 있는 번들 생성도 성공했다. 브라우저에서는 375×812와 데스크톱 화면, 보관함 저장·덮어쓰기·별도 탭 재접속 후 불러오기, 실제 아트 미리보기와 WASD/Shift 이동을 확인했고 콘솔 오류가 없었다. `expo install --check`는 현재 설치 버전들에 대한 패치 업데이트 권고로 실패했다. SDK와 기존 패키지 버전은 유지했으며, 이미 설치되어 있던 `expo-file-system@57.0.6`만 직접 의존성에 명시했다.
