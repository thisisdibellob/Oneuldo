# 빨래하는 날 — 프론트엔드 인수인계

작성일: 2026-10-17. 기존 마을·집과 연결할 빨래 활동의 규칙과 구현 경계를 기록한다. 실제 세탁기 설명서나 의류 전체에 적용하는 세탁 지침을 대신하지 않는다.

## 플레이 흐름

집에서 빨래 여섯 개를 챙겨 마을 세탁소에 간다. 분류대에서 각 빨래의 표시와 주머니를 확인하고, 두 바구니로 나눈다. 청바지 주머니에는 종이 영수증이 들어 있어 세탁 전에 꺼내야 한다. 1번 세탁기는 사용 중이며, 비어 있는 2번 세탁기로 두 바구니를 차례대로 세탁한다.

각 바구니의 세탁은 **결제 확인 → 시작 → 완료 후 꺼내기** 순서다. 표시대로 건조기와 건조대를 고르고, 마른 빨래 네 개를 갠 뒤 양말 두 짝을 맞춘다. 집으로 돌아가 옷장에 넣어야 활동이 완료된다. 세탁소에서 정리한 상태만으로 결과를 만들지 않는다.

제한 시간·실수 감점·게임 오버·실제 결제는 없다. 잘못 선택해도 빨래가 손상되거나 사라지지 않으며, 해당 빨래의 표시를 알려 주고 다시 선택할 수 있다.

## 이번 빨래의 표시

| 빨래 | 바구니 | 건조 | 정리 |
| --- | --- | --- | --- |
| 크림 티셔츠 | 밝은 빨래 | 낮은 온도 건조 | 개기 |
| 청바지 | 색 있는 빨래 | 자연 건조 | 개기 |
| 산호색 수건 | 색 있는 빨래 | 낮은 온도 건조 | 개기 |
| 연두색 수건 | 색 있는 빨래 | 낮은 온도 건조 | 개기 |
| 양말 한 짝 / 나머지 양말 | 밝은 빨래 | 낮은 온도 건조 | 두 짝 맞추기 |

이 구분은 **게임에 등장하는 각 의류에 붙인 표시**다. 청바지는 언제나 자연 건조해야 한다거나 모든 밝은 옷·수건을 같은 방식으로 세탁해도 된다는 일반 규칙을 가르치지 않는다. 실제로는 의류 취급 표시와 사용 기기 설명서를 확인한다. 세제 종류·투입량, 실제 기계 설정, 오염 정도·이염·감염 관리·상업 세탁 업무 전체는 이번 범위에 없다.

세탁과 두 건조 방식은 각각 **게임 시간 6초**로 축약했다. 자연 건조를 포함해 실제 세탁·건조에 걸리는 시간을 의미하지 않는다. 결제 화면용 `LAUNDRY_WASH_PRICE`는 바구니당 연습 금액 3,000원이며, 실제 요금 조사값이나 실제 지갑 차감·카드 결제가 아니다.

## 순수 상태 규칙

규칙: [laundrySession.ts](../src/game/laundrySession.ts). 테스트: [laundrySession.test.ts](../__tests__/laundrySession.test.ts).

상태 흐름은 `packing → travel → sorting → washing → drying → folding → returning → finished`다.

- 여섯 개를 모두 챙겨야 집을 떠날 수 있다. `ARRIVE_LAUNDROMAT`은 화면의 실제 세탁소 진입 시 호출한다.
- 각 빨래의 표시·주머니 확인 후 올바른 바구니로 분류한다. 모든 분류와 영수증 꺼내기를 마치면 자동으로 `washing`이 된다. 영수증을 마지막에 꺼내도 정상 진행한다.
- 밝은 빨래/색 있는 빨래 중 어느 바구니부터 세탁해도 된다. 사용할 수 있는 세탁기는 한 대라 동시에 두 바구니를 세탁하지 않는다.
- `PAY_WASH`는 바구니와 빈 세탁기를 확인한다. 중복 결제는 기록을 늘리지 않는다. `START_WASH`는 같은 바구니·세탁기의 결제를 요구한다.
- 세탁 완료를 두 번 누르거나 아직 끝나지 않은 세탁을 꺼내도 진행을 중복 계산하지 않는다. 두 바구니 모두 꺼낸 뒤 `drying`으로 넘어간다.
- 각 빨래의 건조 방법을 고른다. 해당 방법의 빨래를 모두 배정해야 건조를 시작할 수 있다. 건조기와 자연 건조는 동시에 진행해도 된다.
- 두 건조 작업을 끝낸 뒤에만 빨래를 갤 수 있다. 네 개를 개고 양말을 맞추는 순서는 자유다.
- `returning`은 집으로 돌아갈 준비가 된 상태다. 실제 집 진입에서 `ARRIVE_HOME`을 호출하고, 옷장 이용 시 `PUT_AWAY`를 호출한다.
- 잘못된 입력은 `lastActionError`에 안내를 남기며 다음 유효한 입력이 지운다. 완료 상태는 명시적 `RESET` 외에는 변경하지 않는다.

시작과 완료 타이머 액션은 호출자가 `now`를 전달한다. reducer 안에서는 현재 시각이나 무작위 값을 만들지 않는다. 시작 시각은 이전 작업 완료 이후여야 하며, 완료 시각은 해당 `readyAt` 이상이어야 한다. UI 타이머가 0을 표시하는 것과 작업 완료 기록은 별개다. 실제 UI가 완료 버튼을 활성화한 뒤 `FINISH_WASH`/`FINISH_DRY`를 보내야 한다. 브라우저·단말 시각을 사용하는 로컬 게임이므로 서버 기준 부정행위 방지 기능을 뜻하지 않는다.

## API 계약

| 함수 | 용도 |
| --- | --- |
| `createLaundrySession({id?, now?})` | 새 활동 생성. ID와 시작 시각은 한 번만 생성한다. |
| `applyLaundryAction(session, action)` | 상태와 명시적 액션으로 작업 판정 |
| `getLaundryItem(itemId)` | 이름·색·바구니·취급 표시·건조 방법 메타데이터 |
| `getLaundryBatchItems(session, batchId)` | 현재 해당 바구니에 분류된 빨래 상태 |
| `getLaundryTimerRemaining(job, now)` | 표시할 남은 밀리초. 상태 자체는 바꾸지 않는다. |
| `getLaundryObjective(session)` | 현재 해야 할 행동 한 문장 |
| `getLaundryResult(session)` | 실제로 완성된 활동만 결과 반환. 미완료·불일치 상태는 `null` |

액션 목록:

- `PACK {itemId}`, `PACK_ALL`, `LEAVE_HOME`, `ARRIVE_LAUNDROMAT`
- `INSPECT_CARE {itemId}`, `INSPECT_POCKET {itemId}`, `REMOVE_RECEIPT {itemId}`, `SORT {itemId, batchId}`
- `PAY_WASH {batchId, machineId}`, `START_WASH {batchId, machineId, now}`, `FINISH_WASH {batchId, now}`
- `SELECT_DRYING {itemId, method}`, `START_DRY {method, now}`, `FINISH_DRY {method, now}`
- `FOLD {itemId}`, `PAIR_SOCKS`, `ARRIVE_HOME`, `PUT_AWAY {now}`
- `ASK_HELP`, `CLEAR_ERROR`, `RESET {id, now}`

`LaundrySession.items`는 `itemId`, `packed`, `careChecked`, `pocketChecked`, `receiptRemoved`, `batchId`, `dryMethod`, `folded`를 가진다. `payments`, `washJobs`, `dryJobs`는 작업별 내역을 담는다. 타이머 작업에는 `startedAt`, `readyAt`, `completedAt`이 있다. `homeArrivalConfirmed`, `occupiedMachineSeen`, `helpUsed`는 실제 선택·이동 여부다.

결과에는 `sessionId`, 실제 `completedAt`, 세탁한 빨래 수·바구니 수, 갠 빨래 수·양말 쌍 수, 확인한 표시/주머니 수, 영수증 제거, 자연 건조, 사용 중 세탁기 확인, 안내 다시 확인, 사실 문장 `facts`가 들어간다. 결과 함수는 완료 플래그뿐 아니라 여섯 빨래, 두 결제, 중복 없는 세탁/건조 내역과 각 시간, 정리·집 도착을 다시 검증한다. 실제로 선택하지 않은 도움이나 빈 기계 찾기를 결과에 추가하지 않는다. 성적이나 자립 능력 향상을 추정하지 않는다.

## 화면·저장 경계

이동/충돌/상호작용 거리와 실제 집·세탁소 전환은 화면과 부모 게임이 담당한다. reducer 자체가 마을 좌표를 이동시키지 않는다. 화면 구현은 기존 공통 이동·상호작용 UI와 캐릭터 비율을 사용한다.

[laundryStore.ts](../src/game/laundryStore.ts)의 `getLaundryDraft`, `keepLaundryDraft`, `useLaundryDraft`, `clearLaundryDraft`는 현재 앱 실행 중 상태를 공유한다. 세탁소에서 나와 마을을 걸어도 같은 바구니를 유지하기 위한 저장소다. 동일 객체를 다시 넣으면 구독 알림을 반복하지 않는다. 앱 종료·새로고침 후의 중간 저장이나 서버 저장은 아니다.

앱의 **동네 빨래방** 카드는 `QuestScreen`의 일상생활 항목이며 **생활 훈련** 필터에 포함된다. `onGameQuest('laundry') → AppShell → GamePrototypeScreen`으로 기존 마을에 연결한다. 공통 수첩의 같은 카드는 `GameHud.onOpenLaundry`가 있을 때만 표시하며, 현재 빨래 목표를 보여 주고 수첩을 닫은 뒤 진입 콜백을 실행한다. 카페·도서관·연락 확인 진입을 대체하지 않는다.

완료 앨범은 [activityAlbum.ts](../src/game/activityAlbum.ts)의 `makeCompletedLaundryActivity(session)` / `recordCompletedLaundryActivity(session)`가 담당한다. `getLaundryResult`를 다시 검증하고 실제 완료 시각, 세탁한 여섯 개·갠 네 개·맞춘 양말 한 쌍과 실제 행동 문구만 기록한다. `kind: 'laundry'`와 세션 ID로 중복을 막는다. 기존 활동과 즐겨찾기를 보존하며, 저장 범위는 기존 앨범 규칙(가능한 웹 localStorage, 그 외 현재 실행 메모리)을 따른다.

[PhonePhotos.tsx](../src/components/game/PhonePhotos.tsx)의 **빨래하는 날** 앨범은 바구니 일러스트를 `contain`으로 표시한다. 실제 플레이 스크린샷이라고 표현하지 않는다. 마을 배치·생성 이미지와 전체 화면 검증 결과는 통합 완료 후 아래에 추가한다. core 구현 완료를 실물 Expo Go 검증 완료와 혼동하지 않는다.

## 검증 기록

2026-10-17 `pnpm exec jest --runInBand __tests__/laundrySession.test.ts`: **20개 테스트 통과**.

전체 빨래 흐름, 집 출발/도착 조건, 표시·주머니 확인, 영수증 제거, 잘못된 분류·건조 복구, 사용 중 기계, 중복 결제 방지, 순차 세탁과 순서 자유, 조기/중복 타이머 완료 거부, 유효한 시각, 두 건조 작업, 개기/양말 짝, 집 옷장 완료, 위조된 완료 상태 거부, 선택한 도움만 기록, 완료 후 불변성, 명시적 초기화, 순수 재현과 현재 실행 중 상태 유지를 확인했다. UI·통합 검증 결과는 해당 작업이 끝난 후 추가한다.
