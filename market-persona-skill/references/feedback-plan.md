# 행동 결과를 받는 증분 생성 — feedback-choice-v7

## 현재 기본: feedback-choice-v7

새 `begin_feedback_plan`의 기본은 `feedback-choice-v7`이며 HTTP 생성은 이를 명시한다. 일반 `generate_trace`의 기존 episodic 기본값은 유지한다. 명시적 v1~v6와 과거 저장 자료는 기존 계약으로 재현한다. 아래 v5/v6의 기본 채택 기록은 과거 상태를 설명하며 새 생성에는 이 v7 절을 우선 적용한다.

v7은 v6의 개인 동기·선택권을 유지하며 다음 표현을 분리한다.

- `experience.checks.cartChangedSinceLastCartView`: 실제 장바구니 확인 이후 관측·적용 결과로 확인한 변화. 닫기·목록 읽기는 기준을 초기화하지 않는다. 변화 없음은 false, 변화 있음은 true, 불확실하거나 24행동 기한이 지난 경우는 null이다.
- `rememberedItems.quantity`: 배우가 현재 원한다고 믿는 총수량. 선택적 `rememberedCartQuantity`는 마지막으로 담겨 있었다고 기억하는 수량이며 `source`는 list/personal/uncertain 중 배우가 믿는 출처다. 틀린 값·누락·불확실성을 허용하고 코드가 채우거나 정답과 대조하지 않는다.
- 담기·빼기의 `choiceParameters.quantity`는 추가·제거할 개수다. 기억의 총수량과 구분하며 실제 현재 카탈로그의 상품·수량만 선택한다. 행동 설명이 매개변수를 덮어쓰지 않는다.
- 확인은 이미 선택한 `ongoingIntent`와 구분하고, 실행 전 응답 기억을 실행 완료 사실로 취급하지 않는다. 다음 실제 결과를 보고 배우가 수정 여부를 결정한다.

상품 기억 12개·메모 8개, 최근 행동 6개·장소 6곳·24행동 기한, 원본 페르소나와 배회 신호 0.2는 유지한다. 반복 금지·자동 수량 조정·목표 복원·강제 구매나 종료는 추가하지 않는다. trace에는 feedback version 3, experienceContract `bounded-observed-experience-v2`, beliefContract `quantity-source-beliefs-v1`을 기록한다. 제품의 최대 100행동은 유지하고 사용자가 요청한 300행동은 별도 동결 실험 사본에서만 실행한다. 실제 모델 성능은 별도로 측정하며 구현 검증만으로 성공률 향상을 주장하지 않는다.

**정책 채택 상태:** feedback 기본·권장 정책은 `feedback-choice-v5`다. 현재 UI 정보 표현의 정확성과 기존 합법 행동 집합 보존 검증을 근거로 채택했으며, 성공률·인간 행동 충실도 개선을 입증한 결정은 아니다. `feedback-choice-v6`는 명시적 실험 옵션으로 유지한다. **모델 비교 결과 상태:** 2026-10-12 동일 S01에서 v5·v6 각 5회, 최대 300행동 비교를 완료했다. 두 조건 모두 관측된 목표 상품 노출·담기·완수는 0회였다. v6 1회는 1행동 뒤 선택 ID 오류로 중단돼 이후가 미관측이다. 성공률 개선은 확인되지 않았으며, 같은 궤적의 100·200·300 누적 구간과 실제 사람의 행동 타당성을 구분한다.

일반적인 새 페르소나 행동 생성은 이 경로를 기본으로 사용한다. 전체 trace를 완성해 저장한 다음 검토·대기하고, 실행 요청을 받으면 동일 파일을 실제 앱에서 재생한다. 생성 중 결과는 앱과 공유하는 오프라인 게임 로직의 결과이며 실제 웹 실행 결과가 아니다. 과거 feedback v1/v2/v3/v4·whole-trace/v10 trace, 실험 원자료와 개인·trial은 그대로 보존한다. 과거 feedback 계약은 `actorPolicyVersion:"feedback-choice-v1"`, `"feedback-choice-v2"`, `"feedback-choice-v3"` 또는 `"feedback-choice-v4"`로 명시한다.

## v5 기본과 v6 실험 계약

`begin_feedback_plan`은 버전을 생략하면 v5를 사용한다. HTTP `generate_trace`에는 `actorPolicyVersion:"feedback-choice-v5"`를 지정한다. v6는 `actorPolicyVersion:"feedback-choice-v6"`를 명시한 실험 옵션으로만 사용한다. 명시적 v1~v4의 지시문·관측·선택지·시간 의미, 기존 trace와 실험 원자료는 변경하지 않는다. 아래 새 문맥·시간·기억·배회·종료 규칙은 v4~v6에서 공유하며, v5/v6에는 다음 표현 차이만 추가한다.

| 정책 | 명시적으로 바뀌는 부분 |
| --- | --- |
| `feedback-choice-v5` | 같은 합법 행동의 담기·내려놓기를 매개변수 선택으로 표현하고, 현재 열린 장바구니의 상품명과 실제 구매·복귀 조작 문구를 전달 |
| `feedback-choice-v6` | v5와 같은 관측·선택지에 개인의 원래 동기·강점과 현재 선택한 구체적 활동을 균형 있게 표현하는 지시문만 추가 |

둘 다 페르소나 원본, 기존 믿음 기억 필드와 용량·교체 의미, 최근 경험의 6개 행동·6곳·24행동 기한, `exploration-v2`와 기본 배회 신호 확률 0.2, 행동 시간을 유지한다. v6도 `currentTask`와 `ongoingIntent`를 기존 한도 안에서 사용한다. 새 기억 슬롯·영구 목표·자동 복원·반복 금지·관심 직후 목표 복귀·제출 전 추가 확인·강제 성공을 넣지 않는다. 오기억, 관심 상품 구매, 실패·취소, 재확인, 포기와 빈 장바구니 제출은 계속 선택할 수 있다.

v5/v6의 `availableChoices`에는 add/remove 종류별로 하나의 그룹 선택지가 나타난다. 그룹의 `action`은 `{"type":"add"}` 또는 `{"type":"remove"}`이며 기본 상품·수량이 없다. `parameterSchema`는 필수 필드와 허용 상품 ID를, `catalog`는 각 상품의 실제 선택 가능 수량을 제공한다. 아래는 현재 카탈로그의 한 항목을 가정한 형식 예시다. 실제 응답은 반드시 해당 frame의 선택지·카탈로그를 사용한다.

```json
{
  "productId":"curry",
  "name":"카레",
  "quantity":{"minimum":1,"maximum":6},
  "dragOutcomes":["drop","miss","cancel"],
  "nonDropQuantity":1
}
```

add 응답에는 `choiceParameters.productId`, `quantity`, `dragOutcome` 세 필드가 모두 필요하다. `drop`은 해당 수량을 담는 기존 조작이고, `miss`는 장바구니 바깥에 놓기, `cancel`은 제자리로 되돌리기다. miss/cancel은 기존처럼 수량 1에서만 가능하다. remove는 `productId`와 `quantity`만 요구하며 `dragOutcome`은 금지한다. `parameterSchema.properties.quantity`의 전체 범위보다 선택한 상품의 `catalog[].quantity` 범위가 좁을 수 있으므로 그 상품의 범위를 따른다. 현재 v4가 허용하는 상품·수량·실패·취소 집합을 그대로 표현하며 정답 순위나 권장 수량은 제공하지 않는다.

해당 상품과 수량이 실제 카탈로그에 있을 때의 배우 응답 예시:

```json
{
  "choiceId":"choice-add-product",
  "choiceParameters":{"productId":"curry","quantity":2,"dragOutcome":"drop"},
  "durationMs":0,
  "reason":"고른 카레 두 개를 담는다",
  "memory":{"rememberedItems":[],"currentTask":"카레 담기","notes":[]}
}
```

내려놓기는 현재 `choice-remove-product`가 제공될 때 `choiceParameters:{"productId":"curry","quantity":1}`처럼 제출한다. 담기·내려놓기 외의 선택에는 `choiceParameters` 자체를 생략하며 빈 객체도 보내지 않는다. 상품·수량·결과는 하나의 모델 응답에서 함께 선택하고 이 때문에 별도의 AI 왕복을 추가하지 않는다. `step_feedback_plan`에는 기존 `sessionId,requestId,revision`과 이 응답 필드를 함께 전달한다. 같은 requestId로 재시도할 때 매개변수를 포함한 모든 인자가 같아야 한다. 범위 밖 수량·없는 상품·누락/추가 필드는 기술적 형식 오류로 거절하며 기본값·정답으로 수정하지 않는다. `reason`은 공개 행동 설명으로 기록할 뿐 실제 선택을 덮어쓰거나 내적 의도의 정답으로 간주하지 않는다.

현재 열린 장바구니 또는 계산 화면에서만 `observation.cartItems:[{id,name,detail?,quantity}]`를 제공한다. detail은 해당 UI가 표시할 때만 포함하며 선반 안의 가로 장바구니처럼 설명이 없는 화면에는 추가하지 않는다. 장바구니를 닫으면 현재 내용으로 계속 제공하지 않는다. 이는 기존 `cart`의 **열린 패널 전체 항목** 계약에 화면 상품명을 보완한 것이다. 스크롤 밖 행이나 다른 UI의 가림을 픽셀 단위로 정밀 재현하는 관측은 아니며, 모든 행을 사람이 실제로 읽었다고 해석하지 않는다. 숨은 매대·미관찰 상품의 재고·정답 여부는 전달하지 않는다.

계산의 submit 선택은 실제 화면의 `구매 확정` 라벨과 `구매를 확정하면 이번 시도가 기록되고 결과가 나와요.` 문구를 전달한다. 현재 장바구니로 구매·검토를 요청하는 효과를 설명하며 결제 화면의 닫기는 `다시 고르기`로 매장에 복귀한다. 이것은 실제 조작 의미의 표현이며 목표 충족 여부를 판정하거나 제출을 막는 절차가 아니다. 즉시 채점·재시도 피드백을 미리 안다고 가정하지 않고 실제 접수 확인·나가기 계약을 유지한다.

**행동 예산:** 제품 경로의 feedback 기본·최대 행동 수는 100이다. v5/v6 선택으로 300으로 늘어나지 않으며 `llm.maxCalls`도 행동 한도를 바꾸지 않는다. 300행동은 별도 승인된 동결 실험 소스·제어기에서만 사용한다. 같은 경로의 100/200/300 접두 구간을 비교할 때는 독립 실험 세 개로 세지 않고, 자연 종료는 이후에도 종료 상태로 유지하며 기술 중단 이후는 미관측으로 구분한다. 예산 한도 뒤 자동 담기·이동·계산을 붙이지 않는다.

기술 검증에서는 v4와 그룹을 펼친 v5의 합법 행동 집합 일치, 실패·취소의 수량 1 제한, 현재 화면 정보의 격리, 기존 v4 프레임 보존, v5/v6의 정책 버전·지시문 외 입력 일치를 확인한다. 실제 모델 비교는 별도로 승인된 고정 시도에서 기술적 중단과 미완료를 모두 보존하고, 목표 상품 노출 기회·상품/수량 선택·관심과 재확인·자기수정·종료를 함께 평가한다. 구현 통과나 성공률 하나만으로 페르소나 보존을 입증하지 않는다.

## 정보와 기억

모델에 주는 단위는 현재 `frame` 전체다. 현재 보이는 통로·상품·버튼·설명·행동 결과, 원본 JSON에서 추출한 개인 특성, 배우가 남긴 `memory`, 공개 이동 정책 상태 `movementPolicy`와 제한된 최근 관찰 경험을 포함한다. 전체 snapshot/지도·좌표, 미래 선택지, 숨은 목표, 정답 장바구니, 전체 관측 원장, 이전 모델 응답·대화 전문, `lastReadList`, 사실 기반의 미완료 목표 목록을 붙이지 않는다. snapshot과 `.generation/` 진단은 제어자 감사용이다.

v4~v6의 `bounded-observed-experience-v1`은 최근 6개의 실제 적용 행동·관찰 가능한 결과를 남긴다. 실패·취소도 적용 결과로 남지만 형식 오류·통신 재시도는 새 경험으로 세지 않는다. 최근 관찰한 매대·통로는 각각 최대 6곳, 마지막 관찰 뒤 24개 행동 이내로 제한한다. 매대의 상품·페이지 요약에는 실제로 본 최대 12개 상품·12개 페이지만 담으며, 보지 않은 상품이나 매대 전체 재고를 추정해 채우지 않는다. 목록을 확인했다는 경험은 남겨도 정확한 목록 내용의 영구 사본을 만들지 않는다. 배우가 작성한 믿음과 엔진이 보존한 최근 관찰 경험을 구분한다. 이 한도는 합성 생성기의 설계값이며 개인의 임상적 기억 용량을 뜻하지 않는다.

최근에 같은 목록·장바구니를 확인했는지, 이후 정보가 바뀌었는지, 어느 방향으로 움직였고 어떤 매대를 살펴봤는지를 다음 선택에 활용한다. 잠깐 확인한 뒤 원래 탐색 목적을 이어가거나 이미 살펴본 장소에 다시 왔음을 알아차릴 수 있지만, 반복 확인·배회·재방문·중단을 횟수 규칙으로 금지하지 않는다. 익숙하지 않은 방향을 택하는 일도 배우가 결정하며 코드는 보이지 않는 목적지나 최단 경로를 정하지 않는다. 과거 v1/v2/v3에는 이 경험 상태나 새로운 기억 의미를 소급 적용하지 않는다.

v2~v6의 `moveDirection`은 북·북동·동·남동·남·남서·서·북서의 화면 기준 방향 입력이다. 현재 화면 밖으로 이어지는 방향도 선택할 수 있고, 보이는 상품이나 구매 목적을 이동의 조건으로 삼지 않는다. 배우는 제시된 방향 하나와 입력 지속 시간을 고르며, 실제 게임의 충돌·경계 처리가 이동량을 결정한다. 막힘·일부 이동·제자리 이동도 관찰 결과로 남긴다. 전체 지도·도착점 좌표·최단 경로를 배우에게 제공하지 않는다. v2는 잠기지 않은 world에서 8방향을 모두 제공하고 자동 회피·확률 배회를 하지 않는 기존 계약을 유지한다. v3~v6는 아래 버전별 합성 정책을 적용한다.

매대 이름을 읽을 수 없지만 본체 일부가 보이면 `visibleStructures`에 방향·거리와 익명 `진열대` 단서만 표시할 수 있다. 범주 ID·상품·좌표·상호작용 ID는 포함하지 않는다. 이름이나 실제 가까운 조작 버튼이 보이는 매대는 기존 `visibleStations`로 표시하며 중복하지 않는다. 본체 관측은 실제 개별 매대 artwork 배치와 카메라·HUD 영역을 이용한 보수적 기하 투영이며, 화면 픽셀의 가림을 모두 검증했다는 뜻은 아니다. 이 단서가 없어도 방향 이동은 제공되며 v3~v6에서 제외하는 방향은 실제 막힘 경험에만 근거한다.

## v4~v6 이동 정책과 v3 호환성

v4~v6의 `exploration-v2`는 확률적 무목적 배회를 부드러운 선택 신호로 제공하고, 실제 막힌 방향을 잠시 제외하는 합성 제어 규칙이다. 페르소나의 임상적 행동 확률이나 LLM이 스스로 정한 탐색 성향으로 해석하지 않는다. 모델 실패를 확률 모드로 대체하거나 상품·수량·목표 달성·종료를 보정하는 데 사용하지 않는다.

- `shopping` / `world` / `activeStation` 없음인 판단에서 seed 기반 추첨을 사용한다. `feedbackMovement.wanderProbability` 기본값은 `0.2`이며 0~1로 설정한다. `0.2`는 각 적격 판단의 20% 확률이지 전체 행동의 정확히 20%를 채우는 할당량이 아니다. `0`은 확률 배회만 끄며 막힘 회피는 유지한다.
- `actor-choice`는 일반 선택, `random-wander`는 배회를 고려하는 신호, `blocked-recovery`는 막힌 방향을 피해 다음 선택을 고려하는 신호다. v4~v6는 모든 모드에서 현재 가능한 비이동 선택지를 유지한다. 따라서 배회 신호가 있어도 매대 열기·목록 확인·머뭇거림·중단 등을 고를 수 있다. 이동 여부, 구체적인 방향과 100~2000ms 입력 시간은 모델이 고른다.
- 실제 입력 결과가 완전 막힘(`blocked`)인 방향은 다음 4회의 world 판단 동안 제외한다. 다음 적격 world 판단에 `blocked-recovery` 신호를 제공하지만 v4~v6는 방향 이동을 강제하지 않는다. 부분 막힘과 완전 막힘을 구분하며, 숨은 장애물·미탐색 지도에서 차단 방향을 미리 계산하지 않는다.
- 실제 이동으로 각 막힌 지점에서 24px 이상 벗어나면 해당 방향의 차단 기억을 해제한다. 왕복 이동의 누적 거리가 아닌 순변위를 사용한다. 다른 anchor·station에 도착했다는 관측으로도 해제하며, 같은 anchor 재선택이나 제자리의 목록·장바구니·도움말 확인, 패널 열기/닫기는 차단 이력을 지우지 않는다. 같은 frame을 복구하거나 통신을 재시도할 때 새 배회 추첨으로 바꾸지 않는다.

v3~v6 frame에는 `movementPolicy:{version,mode,eligible,wanderProbability,roll,avoidedDirections}`가 포함된다. 배우에게 이 필드를 포함한 현재 frame 전체를 전달한다. 이는 제어 정책의 공개 상태이며 배우가 작성한 `memory`와 구분한다. 이동 정책이 정확한 쇼핑 목록이나 누락 목표를 기억에 넣지 않는다. 명시적 v3의 `exploration-v1`은 `random-wander`와 `blocked-recovery`에서 방향 이동만 제시하는 기존 계약을 유지하며, v3의 배우 기억도 전체 교체 방식 그대로다.

`generation.movementPolicy`는 실행 설정을 고정하고 각 배우 행동 step의 `movementPolicy`는 `actor-choice` / `random-wander` / `blocked-recovery`의 출처를 기록한다. 시작·시스템 마무리 step에는 붙이지 않는다. 기술적 중단으로 완성 trace가 없는 회차도 진단 로그에 설정과 각 판단의 출처를 보존한다. 분석에서는 v4~v6의 배회·회복 신호와 실제 선택, 제외된 방향, 선택한 방향·시간과 이동 결과를 분리한다. v3의 강제 이동 턴을 v4~v6의 신호와 같은 의미로 집계하거나, 정책 개입을 AI의 전적인 자발적 선택으로 보고하지 않는다.

## 배우의 믿음 기억

`readList` 뒤의 관측에는 화면에 표시된 정확한 목록이 나타난다. 다음 행동 뒤에는 자동으로 다시 제공하지 않는다. 상품 이름·수량·완료 여부의 믿음은 모델이 매 결정의 응답으로 남긴 기억에서 가져온다. v4~v6는 이 믿음과 별도로 제한된 최근 경험을 제공하며, 다음 형식의 선택적 `ongoingIntent`로 진행 중인 목적을 유지한다.

```json
{
  "rememberedItems": [
    {"name":"우유","quantity":1,"certainty":"uncertain","status":"pending"}
  ],
  "currentTask":"목록을 잠깐 확인한다",
  "ongoingIntent":"우유가 있는 매대를 찾는다",
  "notes":[]
}
```

`rememberedItems`, `currentTask`, `notes`는 응답 내용으로 교체한다. `rememberedItems`는 최대 12개, 각 `name`/`currentTask`/`ongoingIntent`/note는 최대 300자, `notes`는 최대 8개다. `name`, `quantity`, `currentTask`는 null일 수 있고 수량은 0~99 정수다. certainty는 clear/uncertain, status는 pending/done/abandoned다. 이 수치는 통신 형식 한도이며 인지능력 측정값이 아니다. 이름·수량의 오기억, 확신하는 오류, 구매 없이 done으로 믿음, 기억에서 항목 누락·삭제를 허용한다. 코드가 정답과 대조하거나 삭제한 목표를 복구하지 않는다. 현재 장바구니가 보이면 배우가 자신의 믿음과 대조하고 수정 여부를 선택하며, 엔진이 정확한 목표 상태로 덮어쓰지 않는다. 짧은 공개 행동·기억 요약만 적고 내면 추론 전문을 요구하지 않는다.

v4~v6의 `ongoingIntent`는 잠깐의 확인·관심 전환과 구분되는 진행 중인 목적이다. 응답에서 생략하면 이전 값을 유지하고, 문자열이면 그 값으로 교체하며, 명시적인 null이면 해제한다. 배우는 목적을 유지·변경·포기하거나 잊었다고 해제할 수 있다. 이 필드는 자동 구매 목표 원장이 아니며 목적을 끝까지 수행하도록 강제하지 않는다. `currentTask`는 바로 할 짧은 활동이므로 목록 확인으로 바뀌어도 `ongoingIntent`가 자동 삭제되지 않는다. 명시적 v1/v2/v3는 `ongoingIntent`와 최근 경험을 추가하지 않고 기존 기억 형식과 교체 의미를 유지한다.

v4~v6 trace의 `generation.feedback`는 `version:2`, `memory:"actor-authored-with-recent-experience"`, `experienceContract:"bounded-observed-experience-v1"`, `intentContract:"persistent-intent-v1"`로 출처를 기록한다. 이는 생성 계약의 버전이며 실제 기억력 향상이나 과업 성공을 입증하는 점수가 아니다.

지원·재확인·독립 수행·관심 이탈·실수·중단은 현재 개인과 상황에 따른 선택이다. 오류나 도움 횟수를 채우지 않는다. 현재 드래그 재생이 지원하는 정상 담기·바깥에 놓아 담기 실패·제자리에 놓기 취소를 선택할 수 있다. 실패/취소는 장바구니를 바꾸지 않고 `result.accepted:false, quantity:0`으로 다음 판단에 전달한다. 이는 관찰 가능한 담기 결과이며 앱의 별도 오류 알림이 나타났다는 주장이 아니다. 보이지 않는 구매 확정 버튼이나 알려지지 않은 ID를 허용하지 않는다.

## 연결

가장 강한 문맥 분리는 HTTP provider 경로다. `generate_trace`에 `actorPolicyVersion:"feedback-choice-v5"`와 기존 `llm` 연결을 지정하면 요청마다 system+현재 frame 두 메시지만 새로 구성한다. 최근 경험은 현재 frame의 제한된 상태로 전달하며 이전 messages나 conversation ID를 전달하지 않는다. 모델에 gpt-6-luna를 지정한 OpenAI 형식 요청에는 low reasoning을 사용한다. 실제 provider의 모델 제공 여부와 연결은 별도로 확인해야 한다. 키는 기존 `llm.apiKeyEnv`로 전달하며 코드·출력에 저장하지 않는다.

```json
{
  "tool":"generate_trace",
  "arguments":{
    "personaId":"mild-intellectual-disability-adult",
    "seed":"feedback-independent-001",
    "snapshotFilePath":"/absolute/path/snapshot.json",
    "outputPath":"/absolute/path/trace.json",
    "actorPolicyVersion":"feedback-choice-v5",
    "feedbackMovement":{"wanderProbability":0.2},
    "llm":{"model":"gpt-6-luna","baseUrl":"http://127.0.0.1:8000/v1","maxCalls":300}
  }
}
```

위 URL은 예시다. 설정된 실제 연결을 사용한다. 다른 모델로 조용히 바꾸거나 AI 실패를 확률 정책으로 대체하지 않는다. v4~v6의 제한된 경험·목적 유지·이동 정책은 실패 fallback과 별개다. 기본 `generate_trace`의 기존 `episodic-choice-v4` 의미는 호환성을 위해 유지하므로 새 feedback 정책을 반드시 명시한다. `llm.maxCalls:300`은 모델 호출 한도이며 feedback의 최대 행동 수 100을 늘리지 않는다.

Codex 직접 배우의 경우 지속형 MCP 또는 `node market-simulator/cli.cjs interactive`에서 다음 도구를 사용한다. 배우는 실제 gpt-6-luna/low로 실행하고 **매 결정에 새 모델 문맥으로 현재 frame만** 전달한다. 동일 배우 채팅에 이전 관측을 계속 쌓는 방식은 이 기억 조건을 충족하지 않는다. MCP는 모델 설정이나 배우 문맥 격리를 강제하지 않으며 `external-frame`으로 출처를 기록한다. 분리를 지원하는 호출 수단이 없으면 그 제한을 명시하고, 격리가 확인됐다고 보고하지 않는다. 제어자가 전체 snapshot이나 이전 bundle을 이미 읽었더라도 배우에게 전달하지 않는다.

1. `begin_feedback_plan({requestId,personaId,seed,snapshotFilePath,outputPath,feedbackMovement:{wanderProbability:0.2}})` 또는 snapshot 대신 tabId를 제공한다. 기본은 v5이며 이동 설정을 생략해도 배회 신호의 확률은 0.2다. `actorPolicyVersion:"feedback-choice-v1"`, `"feedback-choice-v2"`, `"feedback-choice-v3"` 또는 `"feedback-choice-v4"`로 과거 계약을 명시할 수 있다. 응답에 sessionId와 첫 frame이 함께 온다. 같은 requestId와 인자로 재요청하면 같은 세션을 돌려준다.
2. 배우가 현재 `availableChoices`에서 **하나**를 선택하고 `choiceId,durationMs,reason,memory`를 작성하고, v5/v6의 담기·내려놓기에는 해당 카탈로그의 `choiceParameters`도 작성한다. `reason`은 필수인 짧은 공개 행동 서술이며, 이동 목적의 정당화나 구매 관련 근거가 아니다. 목적 없이 걷기·배회·재방문도 허용한다. 제어자가 경로·수량·종료·기억을 대신 작성하거나 수정하지 않는다.
3. `step_feedback_plan({sessionId,requestId,revision,choiceId,durationMs,reason,memory,choiceParameters})`으로 제출한다. 담기·내려놓기 외에는 `choiceParameters` 키를 생략한다. 적용 후 결과와 `nextFrame` 또는 `complete:true`가 같은 응답에 온다. 별도의 observe 왕복은 필요 없다.
4. 통신이 끊기면 **같은 step requestId와 동일 인자**로 재시도한다. 새 requestId로 같은 행동을 다시 보내지 않는다. 현재 frame 복구는 `observe_feedback_plan({sessionId})`을 사용한다. 서버 프로세스가 살아 있는 동안만 요청 기록이 유지된다. 프로세스 재시작은 자동 복구를 지원하지 않는다.
5. 완료 후 `finalize_feedback_plan({sessionId})`으로 파일과 수락/실행 수·시간을 받는다. `acceptedActions`는 유효한 결정 접수 수이며 과업 성공 수가 아니다. `executedActions`는 실패·취소를 포함한 적용 시도 수다. actorWaitingMs에는 모델·전송·제어자 대기가 섞여 있으며 순수 모델 추론 시간으로 해석하지 않는다. plannedElapsedMs는 별도의 시뮬레이션 시간이다.
6. 실제 시작 전 현재 탭으로 `validate_trace`를 수행하고 실행 승인을 받은 범위에서만 `play_trace`한다. 생성·준비 후 대기 요청이 있으면 여기서 멈춘다.

## 행동 시간

새 v5 trace와 명시적 v2/v3/v4/v6 trace는 `generation.timingProfile:"activity-duration-v2"`와 `generation.movementContract:"joystick-direction-v1"`을 기록한다. v3~v6의 배회·회피 모드도 같은 입력 시간 계약을 사용한다. 시작·종료를 포함한 모든 `reactionDelayMs`는 0이다. 배우의 응답은 `delayMs` 대신 `durationMs`를 사용하며, 구형 요청은 자동 변환하지 않고 거절한다.

- `moveDirection`은 조이스틱을 해당 방향으로 유지하는 시간 100~2000ms를 배우가 정한다. 이동 전 대기나 이동 후 추가 대기가 아니다.
- 담기·빼기·매대 열기/닫기·직원 요청·계산·제출·중단은 `durationMs:0`이다.
- 머뭇거림(`pause`), 주위 살피기(`lookAround`), 목록 읽기(`readList`), 상품 탐색(`browse`)는 배우가 활동 시간 100~120000ms를 정한다.
- 장바구니·도움말(`viewCart`, `viewHelp`)은 화면을 연 뒤 확인하는 시간 0~120000ms를 정한다. 열기만 하면 0이다.

예를 들어 방향 이동은 `durationMs:900`, 목록 확인은 `durationMs:1800`, 별도 머뭇거림은 `durationMs:1200`으로 보낸다. 예시 시간은 고정값이나 권장 기준이 아니다. 선택지의 `timing`은 허용 범위와 적용 시점을 알리고 `action.durationMs:0`은 아직 시간을 선택하지 않은 템플릿이다. 실제 동작에는 배우가 응답한 시간을 넣는다. 일반 행동에 양수 시간을 넣거나 시간 행동에 0을 넣으면 형식 오류다. 머뭇거림을 이동·드래그 이유에 적어도 자동 대기를 만들지 않으며 명시적 `pause`를 선택해야 한다.

명시적 v1은 `activity-duration-v1`을 유지하며 기존 화면 내 anchor 이동을 `durationMs:0`으로 선택한다. 명시적 v2에는 자동 배회·회피를 적용하지 않으며 명시적 v3는 `exploration-v1`을 유지한다. 저장된 v1/v2/v3의 선택지·순서·시간과 재생 의미를 새 정책으로 자동 변환하지 않는다.

실제 보행·드래그 동작, 화면 전환과 서버 접수 대기는 실행에 필요한 시간으로 유지한다. 이 시간을 배우의 확인 시간에 중복해서 더하지 않는다. HTTP 및 직접 Codex 배우 모두 같은 시간 계약을 사용한다. 기존 `actor-preserved-v1` 저장 trace의 시간은 보존하며 새 계약을 소급 적용하지 않는다. 새 실행용 배우 어댑터는 v5 정책의 그룹 선택지·`choiceParameters`, 현재 `cartItems`, 최근 경험·`movementPolicy`를 포함한 현재 frame과 선택적 `memory.ongoingIntent`를 수용해야 한다. 과거 output의 배우 스크립트·frame·추론·보고서 원본을 수정해 새 계약으로 바꾸지 않는다. 코드 변경 후 새 생성/웹 재생 전에는 MCP 프로세스와 앱 번들을 새로 로드한다.

## 종료·호환성과 검증

배우가 지정한 활동 시간을 유지하며 compact는 거절한다. 자발적 제출·중단은 그대로 저장한다. 최대 100회나 더 작은 maxActions/시간/모델 호출 한도에 걸리면 기술 실패로 진단을 보존하고 완성 파일을 만들지 않는다. 자동 장보기·정답 보충·계산대 이동·제출을 덧붙이지 않는다. 코드가 모르는 ID, stale revision, 잘못된 JSON은 기술 오류이며 페르소나 실수로 세지 않는다.

feedback v1~v6는 첫 방문 생성에 적용한다. 기존 learner 원장의 정확한 목록·에피소드를 새 믿음 기억으로 자동 이식하지 않으며, learnerFile/revisit 연결은 지원하지 않는다. 기존 반복 학습 경로는 해당 정책 버전으로 유지한다. 계산기·현금 입력·거스름돈 등 현재 재생 계약에 없는 조작은 추가하지 않았다.

수용 검증은 최근 적용 행동·결과의 다음 frame 전달과 6개 한도, 실제 관찰한 매대·통로 각각 6곳 및 24개 행동 기한, 매대별 관찰 상품 12개·페이지 12개의 요약 한도, `ongoingIntent`의 생략 유지·문자열 교체·null 해제, 다른 믿음 필드의 교체 의미를 확인한다. v4~v6의 배회·회복 모드에서도 현재 가능한 비이동 조작이 유지되고, 명시적 v3는 기존 방향 이동 제한을 유지해야 한다. 물건이 없는 world의 방향 입력, 동일 seed·판단의 배회 추첨 재현, 확률 0/1 및 기본값, 완전 막힘 방향의 4회 제외, 실제 이동 뒤 해제와 제자리 패널 조작 뒤 유지, 출처 기록과 v1/v2/v3 호환성도 포함한다. 현재 관측·경험이 같은 숨은 배치·목표 변경 시 입력 불변, 좌표·숨은 재고·영구 목록 비노출, 벽·경계의 막힘/일부 이동 보존, 입력 시간 중복 없음, 오기억·누락·잘못 담기 보존, 실제 드래그 실패 후 복귀, 중복 제출 무실행, 기술 한도에서 자동 완수 없음을 확인한다. HTTP 테스트 응답이나 수동 전송 fixture를 실제 모델 표본으로 보고하지 않는다.

완수 편향 변화는 구현 테스트만으로 판정하지 않는다. 이번 기억·이동 정책 구현을 이유로 대규모 AI 생성이나 클리어 검증 실험을 자동 실행하지 않는다. 별도로 승인된 모델 비교에서는 같은 개인·모델·snapshot과 고정 시도 수로 명시된 정책을 비교하고 기술 실패·포기를 포함한 모든 시도를 보존한다. 새 정보 없는 목록 재확인, 같은 통로·매대 재방문, 탐색 범위, 첫 매대 노출, 목표상품을 보고 담을 기회, 실제 선택, 오품목·수량·누락·도움·자기수정·종료와 호출 비용을 분리한다. v4~v6의 배회·회복 신호 이후 선택과 v3의 강제 이동 개입은 각 계약에 맞게 따로 집계한다. 승인된 최근 경험·목적 유지·이동 정책 외에 성공률을 높이도록 행동을 보정하거나 결과가 좋은 시도만 고르지 않는다. 이전 v1/v2/v3 비교와 whole-trace-v3 / v10 / v1의 27개 탐색 비교는 당시 정책·조건·원자료를 그대로 유지한다.
