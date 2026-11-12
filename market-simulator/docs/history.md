# 변경 이력과 레거시 경로

[README](../README.md)에서 분리한 과거 기본 경로와 실험 기록이다. 새 생성에는 적용하지 않으며, 저장된 자료의 재현·비교에만 참고한다. 현재 주력 경로는 [Luna 전체 계획](whole-trace.md)의 결정별 작성 모드다.

## feedback-choice 경로 (당시 기본: v7)

새 `begin_feedback_plan`의 기본은 `feedback-choice-v7`이며 HTTP 생성은 이를 명시한다. 일반 `generate_trace`의 기존 episodic 기본값은 유지한다. 명시적 v1~v6와 과거 저장 자료는 기존 계약으로 재현한다. 아래 v5/v6의 기본 채택 기록은 과거 상태를 설명하며 새 생성에는 이 v7 절을 우선 적용한다.

v7은 v6의 개인 동기·선택권을 유지하며 다음 표현을 분리한다.

- `experience.checks.cartChangedSinceLastCartView`: 실제 장바구니 확인 이후 관측·적용 결과로 확인한 변화. 닫기·목록 읽기는 기준을 초기화하지 않는다. 변화 없음은 false, 변화 있음은 true, 불확실하거나 24행동 기한이 지난 경우는 null이다.
- `rememberedItems.quantity`: 배우가 현재 원한다고 믿는 총수량. 선택적 `rememberedCartQuantity`는 마지막으로 담겨 있었다고 기억하는 수량이며 `source`는 list/personal/uncertain 중 배우가 믿는 출처다. 틀린 값·누락·불확실성을 허용하고 코드가 채우거나 정답과 대조하지 않는다.
- 담기·빼기의 `choiceParameters.quantity`는 추가·제거할 개수다. 기억의 총수량과 구분하며 실제 현재 카탈로그의 상품·수량만 선택한다. 행동 설명이 매개변수를 덮어쓰지 않는다.
- 확인은 이미 선택한 `ongoingIntent`와 구분하고, 실행 전 응답 기억을 실행 완료 사실로 취급하지 않는다. 다음 실제 결과를 보고 배우가 수정 여부를 결정한다.

상품 기억 12개·메모 8개, 최근 행동 6개·장소 6곳·24행동 기한, 원본 페르소나와 배회 신호 0.2는 유지한다. 반복 금지·자동 수량 조정·목표 복원·강제 구매나 종료는 추가하지 않는다. trace에는 feedback version 3, experienceContract `bounded-observed-experience-v2`, beliefContract `quantity-source-beliefs-v1`을 기록한다. 제품의 최대 100행동은 유지하고 사용자가 요청한 300행동은 별도 동결 실험 사본에서만 실행한다. 실제 모델 성능은 별도로 측정하며 구현 검증만으로 성공률 향상을 주장하지 않는다.

**정책 채택 상태:** feedback 기본·권장 정책은 `feedback-choice-v5`다. 현재 UI 정보 표현의 정확성과 기존 합법 행동 집합 보존 검증을 근거로 채택했으며, 성공률·인간 행동 충실도 개선을 입증한 결정은 아니다. `feedback-choice-v6`는 명시적 실험 옵션으로 유지한다. **모델 비교 결과 상태:** 2026-10-12 동일 S01에서 v5·v6 각 5회, 최대 300행동 비교를 완료했다. 두 조건 모두 관측된 목표 상품 노출·담기·완수는 0회였다. v6 1회는 1행동 뒤 선택 ID 오류로 중단돼 이후가 미관측이다. 성공률 개선은 확인되지 않았으며, 같은 궤적의 100·200·300 누적 구간과 실제 사람의 행동 타당성을 구분한다.

새 페르소나 생성의 권장 경로는 **`feedback-choice-v5`**이다. `begin_feedback_plan`의 기본은 v5이고 첫 관측을 돌려주며, `step_feedback_plan`은 행동 하나를 적용한 결과와 다음 관측을 함께 반환한다. 현재 화면과 배우가 남긴 믿음 기억에 최근 6개 적용 행동·결과와 제한된 매대·통로 관찰 경험을 전달한다. 선택적 `memory.ongoingIntent`로 진행 중인 목적을 현재 활동인 `currentTask`와 분리한다. `exploration-v2`는 실제 막힌 방향을 잠시 제외하고 기본 20%의 seed 기반 배회 신호를 제공하되, 배회·회복 모드에서도 매대 열기·확인·중단 등 현재 가능한 비이동 조작을 모두 유지한다. 이동 여부·방향·100~2000ms 입력 시간은 모델이 선택하며 구매 목적이나 보이는 대상은 필요 없다. 전체 지도·좌표·숨은 목표·정답 원장은 배우에게 주지 않는다. 정확한 목록은 읽은 직후에만 노출하고 오기억·누락·잘못된 완료 믿음을 자동 수정하지 않는다. 최대 행동 한도 100과 자동 계산 없음은 유지한다. 저장된 전체 trace를 검토한 뒤 실제 웹에서 재생하는 흐름은 유지한다. 연결·기억 형식·실패 처리·문맥 격리와 한계는 [새 생성 절차](../../market-persona-skill/legacy/feedback-plan.md)에 있다.

HTTP provider는 `generate_trace({actorPolicyVersion:"feedback-choice-v5", feedbackMovement:{wanderProbability:0.2}, ...})`로 선택하며 매 판단에 새 system+현재 frame 메시지만 보낸다. `begin_feedback_plan`도 `feedbackMovement`를 받으며 `wanderProbability`는 0~1, 생략 시 0.2다. 정책을 생략한 일반 `generate_trace`의 기존 `episodic-choice-v4` 기본값은 유지한다. 직접 Codex 배우는 실제 Luna/low의 새 판단 문맥이 필요하며 최근 경험·`movementPolicy`를 포함한 현재 frame 전체를 전달한다. 서버가 외부 배우의 과거 문맥 삭제를 보장하지는 않는다. 새 정책은 첫 방문 생성에 적용하며 기존 learner 원장은 자동 가져오지 않는다. timing은 original이고 compact는 허용하지 않는다. v4~v6 모두 `activity-duration-v2`와 `movementContract:"joystick-direction-v1"`을 사용한다. 명시적 `feedback-choice-v3`는 `exploration-v1`의 강제 방향 이동과 기존 믿음 기억 계약, 명시적 `feedback-choice-v2`는 자동 배회·회피 없이 8방향을 제공하는 계약, 명시적 `feedback-choice-v1`은 기존 anchor 이동·관측·시간 계약을 보존한다. 명시적 v4의 프레임·합법 행동과 저장된 v1/v2/v3/v4 및 아래 whole-trace/v10 경로도 그대로 유지한다.

`exploration-v2`는 `shopping` / `world` / `activeStation` 없음인 판단에 적용한다. `actor-choice`는 일반 선택, `random-wander`는 배회를 고려하는 신호, `blocked-recovery`는 완전 막힘 뒤 다른 선택을 고려하는 신호다. v4~v6는 세 모드 모두 현재 가능한 비이동 조작을 유지한다. 완전히 막힌 방향은 다음 4회의 world 판단에서 제외하며, 실제 24px 이동 또는 관측된 위치 변경이 있으면 차단 기억을 초기화한다. 제자리 패널 열기·닫기로는 이력이 사라지지 않는다. `wanderProbability:0`은 확률 배회 신호만 끄고 막힘 회피는 유지한다. 20%는 적격 판단별 신호 발생 확률이며 실제 이동 횟수 할당량이나 임상 통계가 아니다. frame의 `movementPolicy:{version,mode,eligible,wanderProbability,roll,avoidedDirections}`, trace의 `generation.movementPolicy`와 각 step의 `movementPolicy`에 설정과 개입 출처를 남긴다. 명시적 v3의 `exploration-v1`은 배회·회복 턴에 방향 이동만 제시하는 기존 제한을 유지한다. 분석에서는 v4~v6의 신호와 실제 선택, v3의 강제 이동을 구분한다. 숨은 지도로 우회로를 찾거나 목표 상품·수량·성공을 보정하지 않으며, AI 실패를 대신하는 fallback도 아니다.

v4~v6의 `bounded-observed-experience-v1`은 최근 6개 적용 행동·관찰 결과와 최근 관찰한 매대·통로를 각각 최대 6곳씩 전달한다. 장소 경험은 마지막 관찰 뒤 24개 행동 이내로 제한하고, 매대별 상품·페이지 요약은 실제 관찰한 최대 12개 상품·12개 페이지만 담는다. 전체 방문 원장이나 정확한 쇼핑 목록의 영구 사본은 만들지 않는다. 배우는 최근 확인 뒤 새 정보가 생겼는지, 현재 보이는 장바구니와 자신의 믿음이 일치하는지를 판단하고 다음 행동이나 기억 수정 여부를 선택한다. 반복 확인·재방문·중단을 횟수 규칙으로 금지하지 않는다. `ongoingIntent`는 생략하면 이전 값 유지, 문자열이면 교체, null이면 해제하며 `rememberedItems`·`currentTask`·`notes`는 응답으로 교체한다. 이 형식은 자동 목표 보정이나 임상적 기억력 측정이 아니다. 새 trace의 `generation.feedback`에는 `version:2`, `memory:"actor-authored-with-recent-experience"`, `experienceContract:"bounded-observed-experience-v1"`, `intentContract:"persistent-intent-v1"`을 기록한다.

v2~v6의 `visibleStructures`는 매대 이름을 읽을 수 없어도 보이는 본체의 방향·거리와 익명 `진열대` 단서를 전달한다. 범주·상품·좌표·상호작용 ID를 제공하지 않으며, 가까운 버튼이나 표지로 이름이 확인된 매대와 중복하지 않는다. 보수적인 sprite/HUD 기하 투영이며 실제 픽셀의 모든 가림을 판정하는 기능은 아니다. 본체 단서는 방향 이동의 전제 조건이 아니며, v3~v6의 회피는 실제 관측된 막힘만 이용한다.

기본 `feedback-choice-v5`는 v4의 합법 행동을 유지하면서 화면 정보와 선택의 표현을 보완한다. `begin_feedback_plan`은 생략 시 v5를 사용하며, HTTP `generate_trace`에서는 `actorPolicyVersion:"feedback-choice-v5"`를 명시한다. 담기·내려놓기를 각각 하나의 선택지와 현재 상품 `catalog`로 묶으며, 같은 모델 응답의 `choiceParameters`로 상품·수량·담기 결과를 고른다. 예를 들어 현재 카탈로그에 해당 상품과 수량이 있을 때 담기 매개변수는 `{"productId":"curry","quantity":2,"dragOutcome":"drop"}`이다. add는 세 필드가 모두 필요하고, remove는 `productId`와 `quantity`만 받는다. 실패 `miss`·취소 `cancel`은 기존과 같이 수량 1에서만 가능하다. 그 밖의 선택에는 `choiceParameters`를 생략한다. 기본 상품·수량을 대신 채우거나 목표를 우선 정렬하지 않으며, 기존 v4의 합법 행동 집합을 유지한다. [전체 응답 예제와 검증 규칙](../../market-persona-skill/legacy/feedback-plan.md#v5-기본과-v6-실험-계약)을 참고한다.

v5/v6에서만 현재 열린 장바구니·계산 화면에 `cartItems:[{id,name,detail?,quantity}]`를 전달한다. detail은 해당 UI가 표시할 때만 포함하고, 구매 버튼은 실제 화면의 `구매 확정` 및 `구매를 확정하면 이번 시도가 기록되고 결과가 나와요.` 효과를 전달한다. 계산 화면의 닫기는 `다시 고르기`로 매장에 복귀한다. 정답과의 자동 비교·부족 수량·제출 전 추가 확인이나 성공 조건 검사는 넣지 않는다. `cartItems`는 기존의 열린 장바구니 패널 전체 관측 계약에 상품명을 보완한 것으로, 스크롤 밖 행·가림을 픽셀 단위로 재현한 것은 아니다. 장바구니가 닫힌 뒤 현재 내용으로 계속 제공하지 않으며 미관찰 상품·재고를 추가하지 않는다.

명시적 `feedback-choice-v6`는 v5와 같은 관측·선택지에 지시문만 조정한 비교 후보다. 원래 개인의 장보기 동기와 강점, 현재 기억·관찰에 근거한 구체적 활동을 기존 `currentTask`·`ongoingIntent`에 표현하도록 하되, 기억 슬롯·보존 기간·목표 복원·반복 금지·즉시 목표 복귀·강제 완수는 추가하지 않는다. v5/v6 모두 페르소나 원본, 믿음 기억의 용량·교체 방식, 최근 경험 한도, `exploration-v2`와 기본 배회 신호 20%, 행동 시간·게임 규칙을 v4와 공유한다. 기존 v1~v4의 관측·선택지·지시문과 저장된 자료는 그대로 유지한다. 제품 경로의 feedback 기본·최대 행동 수는 **100**이고 자동 계산을 추가하지 않는다. **300행동은 별도 승인된 동결 실험 경로에서만** 사용하며 제품 한도가 바뀌었다고 설명하지 않는다. v6의 채택 여부와 모델 효과는 같은 개인·조건의 비교 결과, 관찰 기회와 기술 중단을 검토해 별도로 판단한다.

페르소나 충실도 검증은 기존 공통 성향 5축과 첫 플레이 성향 4축, 유형 5개의 조합을 평가한다. MCP 도구 6개를 사용하고, 같은 맥락에서 성향 하나만 다른 표본 비교·기회 미발생 구분·A/B 성향 추정·원본 불변 검사를 제공한다. 일반 생성 경로에서 자동 실행하지 않는다. 자세한 입력·출력·분모·한계와 기존 v2 호환 절차는 [검증 절차](../../market-persona-skill/references/persona-validation.md)를 따른다.

페르소나 생성기는 `walkTo`, `readList`, `browse`, `openShelf`, `dragProduct`, `viewCart` 같은 행동 **의도**를 JSON으로 만든다. 개발용 Expo 웹앱이 전체 trace를 받아 기존 이동·버튼·드래그 입력 경로로 실시간 재생한다. 게임 로그는 앱의 기존 `MarketBehaviorTracker`와 큐가 기록·전송한다. 생성기와 MCP에는 `BehaviorLogRequest` 생성·변환·직접 전송 기능이 없다.

Luna 전체 계획 경로는 전체 세계를 전개 계산용 참고 자료로 전달하되 인물의 관찰 사실 원장과 현재 작업 기억을 분리한다. 실제 Codex Luna가 각 행동의 상태·사용 기억·근거와 종료까지의 배열을 한 번 작성하고 Node가 제출 후 화면 전개와 기억의 출처·일관성을 검사해 앱용 trace를 저장한다. 코드가 계산한 상태를 Luna의 다음 판단에 실시간 주입하거나 행동마다 모델을 호출하지 않는다. 전체 세계가 모델 문맥에 있으므로 사후 감사는 숨은 정보 영향 차단을 입증하지 않는다. 기존 generate_trace는 실제 LLM이 다음 행동을 선택하는 증분 방식이며, 행동 전부를 결정하는 확률 회귀 정책은 mode:"stochastic"에 한정한다. v4의 `exploration-v2` 신호·막힘 회피와 명시적 v3의 `exploration-v1` 선택 제한은 이와 별개이며 구체적인 방향·시간은 모델이 고른다. 생성기의 가상 시간·좌표·이벤트를 앱에 전송하지 않는다. 화면 재생의 시간과 위치는 실제 앱이 결정한다.

이 기억·이동 정책 구현만으로 대규모 AI 표본이나 클리어 검증 실험을 자동 실행하지 않는다. fixture 테스트를 실제 AI 실행으로 보고하지 않으며, 과거 v1/v2/v3 실험의 frame·추론·trace·보고서 원본은 수정하지 않는다. 별도로 승인된 비교에서는 새 정보 없는 재확인·같은 장소 재방문, 배회·회피 개입과 모델 선택, 상품 관측 기회와 실제 담기, 완성·기술 실패·구매 성공을 각각 집계한다.

정책 옵션·learner 신원 없이 호출한 `generate_trace`는 기존 `episodic-choice-v4` 프롬프트·C1부터 시작하는 선택 ID·선택 순서·300회 기술 상한을 유지한다. `actorPolicyVersion:"episodic-choice-v9"` 또는 `create_learner`로 만든 v9 신원의 `learnerFile`을 명시하면 새 provider 정책을 선택한다. 아래 Codex 직접 증분 계획과 전체 계획도 별도 도구로 명시적으로 시작한다.

현재 Codex 모델이 직접 actor 행동을 고르는 증분 경로는 MCP의 `begin_actor_plan` → `observe_actor_plan` → `append_actor_plan` → `finalize_actor_plan`이다. `append_actor_plan`은 현재 revision의 choice ID 1~3개와 행동마다 `delayMs`/`reasons`를 받는다. 수락된 첫 행동 뒤 현재 actor 관측과 choice ID 집합이 달라지면 나머지 계획을 버리고 새 관측을 요청한다. 항상 3개를 채우지 않는다. 이 모드는 `gpt-6-luna` / `low`, actor policy `episodic-choice-v10`, trace policy `6`으로 표시되고 외부 LLM API 키가 필요 없다. 전체 계획은 아래 별도 도구를 사용한다. 두 경로 모두 생성된 전체 trace를 일반 `validate_trace` 후 `play_trace`로 앱에 전달한다.

### 경험 기반 AI 행위자 v1 (2026-09-30)

AI 경로는 AttentionPolicy의 확률 선택·기억 소실·감정/능력 수치를 사용하지 않는다. 고정 개인 특성(관심·강점·선호·지원 필요)을 바탕으로, 현재 관찰과 최근 6개 관찰 경험을 모델에 전달한다. 실제 실행 여부가 확인된 이전 회차 경험은 최대 24개다. 이 수는 실행 컨텍스트 예산이며 실제 사람의 기억 용량으로 보정된 값이 아니다. 전체 연구 문서를 매 행동에 반복하기보다 기존 페르소나의 구조화된 개인 특성을 전달한다.

`record-pilot-round.cjs`는 앱 완료 보고서와 DB 로그 연속성을 검증한 AI 재생에만 `experience.learning`을 만든다. 저장 내용은 실제 실행한 목록 읽기·상품 선택/제거·장바구니 열기와 해당 화면의 안내다. v9 시스템 계산 회차에서는 `firstStepId` 이전의 개인 행동 경험만 저장하고 자동 처리 구간은 제외한다. 표시 내용은 바인딩된 스냅샷에서 재구성하므로 실제로 읽고 이해했음을 뜻하지 않는다. 가상 계획의 경험은 같은 계획 생성 안에서만 쓰며 장기 경험으로 승격하지 않는다. 분석의 숨은 정답이나 성공 판정을 주입하지 않는다.

다음 `generate_trace`에는 `attentionExperience: {visit, previousLayoutKey, memory, learning}`을 전달한다. 첫 방문/확률 모드에는 learning을 허용하지 않으며, 앱 탭에 실행할 때 계정도 일치해야 한다. 배운 전략을 정답 문장으로 삽입하거나 반복마다 오류 확률을 낮추지 않는다. AI가 구체적인 경험을 참고하는 과정이며 실제 인간의 학습/망각/전이를 입증한 모델이 아니다. 별도 실제 참여자 자료로 보정하고 평가해야 한다.

사용자가 Codex 어시스턴트의 직접 플레이를 요청한 경우 이 생성기로 행동을 대신 정하지 않는다. 새 실험은 [직접 역할 수행 규약 v2](../../market-persona-skill/legacy/assistant-learning-protocol.md)를 따른다. [민재 연구 참고 사례](../personas/research-learning-minjae-v2.json)의 빈 기억에서 시작하고, 실제 UI 원본/sessionId/시각/해시를 연결한 `ResearchArchive`와 배우의 `ResearchMemory`, 현재 `ResearchRecall`을 분리한다. `researchEncodingContext`에는 최근 관찰과 자신의 연상만, `researchRetrievalContext`에는 자신의 연상과 현재 UI만, `researchLearnerContext`에는 선택한 회상과 현재 UI만 전달한다. 전체 원본과 분석/채점은 행동 입력에 넣지 않는다. 회상 오류를 정답으로 덮어쓰거나 자동 숙달을 만들지 않는다. CLI `scripts/prepare-research-learner.cjs`가 실제 원본 파일 해시를 확인하며, 내용의 진실성과 UI 일치는 별도로 확인한다. [출처와 구현 범위](../../docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md)를 함께 읽는다. 기존 `AssistantExperience` / `assistantLearnerContext`는 v1 기록을 읽는 경로로 보존하며 새 조건에 이식하지 않는다.

실행 확인 경험에는 읽은 목록, 표시 안내, 열어 본 상품 페이지, 담기/빼기, 장바구니 확인을 담는다. 현재 계획 중 기억에도 선택한 이동/매대와 관찰한 상품을 함께 보관한다. 행동 이름만 남겨 무엇을 봤는지 잃는 문제를 줄이기 위한 변경이다. 실제 요청 검사와 미해결 탐색 반복은 [2026-09-30 검증 기록](../../docs/ai/actor-learning-2026-09-30.md)을 따른다.

## 관찰 기억 보존 v2 (2026-09-30)

`episodic-choice-v2`는 최근 행동 6개와 별개로 현재 회차에서 실제 표시된 시작/결제 안내, 마지막으로 읽은 목록, 발견 장소·상품·통로, 이동한 연결과 목적지 방문 횟수를 모델에 전달한다. 위치 단서는 관찰 당시 위치 기준임을 표시하며 현재 화면 단서를 우선한다. 아직 보지 않은 지도나 목표 상품 위치를 계산해 넣지 않는다.

AI는 짧은 `currentTask`를 직접 출력할 수 있다(최대 160자). 다음 요청의 `actorChosenTask`로 이어지며 코드가 목표를 대신 선택하지 않는다. 이 문장은 가상 행위자의 임시 의도이며 실제 사람의 발화나 내면 사고를 측정한 것이 아니다. 과거 회차의 현재 작업과 목표 목록은 새 회차에 자동 복사하지 않는다.

장소·상품 기록은 컨텍스트 크기를 제한하는 버퍼다(통로 256, 장소 64, 상품 96, 최근 이동 48). 이는 임상적 기억/망각 모형이 아니다. 정보가 입력에 있다는 사실과 그것을 이해·활용하는 능력은 구분한다. 모델은 기록을 잘못 해석하거나 재확인할 수 있으며 자동 성공률 증가나 정답 행동 대체는 없다.

[보완 및 비교 시험](../../docs/ai/actor-memory-v2-2026-09-30.md)


후속 `episodic-choice-v3`는 위 기억 보존에 동작 피드백을 추가한다. `lookAround`/`pause`의 선택지에는 제자리 대기이며 화면을 회전/확장하지 않는다는 설명을 붙인다. 대기 전후 관찰이 동일하면 새 장소/상품이 보이지 않았음을 결과에 기록한다. 자동 행동 교체나 반복 금지는 없다.


최종 `episodic-choice-v4`는 이동 선택지에 현재 방향·거리와 기억에 기록된 도착 횟수/현재 위치 여부를 같이 표시한다. 별도 목록의 통로 ID를 대조하지 않아도 기존 관찰 이력을 확인할 수 있다. 행동 후보를 정답 기준으로 정렬하거나 방문한 통로를 제거하지 않는다.

## 개인별 경험과 A/B/C 반복 실험 (2026-09-30)

현재 인물 버전은 지민 v5, 서연·민수 v3이며 기본 provider 정책은 `episodic-choice-v4`다. `actorPolicyVersion:"episodic-choice-v9"` 또는 v9 learner 신원을 명시한 provider 학습은 `episodic-choice-v9`, 별도로 시작한 Codex 증분 계획은 `episodic-choice-v10`, 전체 계획은 `whole-trace-v3`이다. 성격/시작 습관은 프로필에, 실험 중 확인된 경험은 별도 learner 파일에 저장한다. `learningProfile`은 관찰 영역과 상황 조건이며 매회 능력 상승이나 지정 행동을 강제하지 않는다. 아래 회차 생성 예시는 v9 learner 신원에 묶인 provider 학습 경로다. 전체 계획은 위의 새 개인·trial과 `prepare_whole_trace`/`submit_whole_trace`를 사용하고 실행·증거 기록·비교는 기존 회차 도구를 재사용한다. 기존 `whole-trace-v1`/`whole-trace-v2`의 개인·실험·저장 trace는 새 정책으로 소급 변경하지 않는다.

[학습 실험 절차](../../market-persona-skill/legacy/learning-trials.md)에 설정 예제와 전체 MCP 순서가 있다. `create_learner`, `create_learning_trial`, `prepare_learning_round`, `generate_learning_round`, `record_learning_round`, `record_learning_failure`, `compare_learning_trial`을 추가했다. CLI는 각각 `create-learner`, `create-trial`, `prepare-round`, `generate-round`, `record-round`, `record-failure`, `compare-trial`이다.

개인 archive는 완료된 앱 replay와 DB receipt를 검사한 원본을 전부 보관한다. v2 경험은 개인/계정/페르소나 버전/실험군/모델/정책과 각 실행 session/replay/step에 묶인다. AI 입력은 실제 표시된 현재 단서와 관련성·최근성을 기준으로 최대 12개 경험을 선택하며, 성공 여부로 선별하지 않는다. 기존 v1 경험은 과거 수동 생성과 호환되지만 새 실험 저장에는 신원 결합이 필요하다. archive hash는 실수로 바뀐 파일을 찾는 용도이며 DB 서버의 전자서명이나 인간 학습의 증거는 아니다.

A는 일반 과제와 기억, B는 맞춤 과제와 기억, C는 맞춤 과제와 이전 기억 미전달을 사용한다. C도 증거는 보관한다. 기준 과제 → 사전 지정 횟수의 연습 → 공통 평가 과제 순서를 저장하고 중단 후 재개할 수 있다. B/C의 연습은 직전 세션 분석 READY와 연결된 AI 퀘스트의 실제 화면 내용이 일치해야 한다. 고정/평가 과제는 사전 등록 snapshot과 일치해야 하며 일반 과제로 대체된 오류 응답은 맞춤 표본으로 받아들이지 않는다.

현재 회차 도구는 새 앱 화면으로 이동하거나 인증된 분석 API를 대신 호출하지 않는다. Codex가 정상 앱 경로로 다음 미션을 로드하고 실제 응답 파일을 전달하면 준비·기억 전달·증거 연결·비교를 처리한다. `generate_learning_round`는 모델 호출까지 하지만 앱 재생은 `play_trace`로 명시적으로 실행한다. 모델과 앱/격리 서버 연결이 없는 환경의 자동 테스트는 계약 검증이며 수행 향상 실험이 아니다.

최근 관찰에 화면 방향/보이는 표지 설명, 실제 도움 본문, 직원 응답을 포함했다. 의미 없는 ID를 해석하는 부담을 줄였지만 이동 후보를 정답 순서로 정렬하거나 재방문을 금지하지 않는다. 이 보완만으로 LLM의 완주나 향상이 확인됐다고 주장하지 않는다.
