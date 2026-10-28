# Oneuldo 장보기 의도 trace와 앱 재생

## 현재 기본: feedback-choice-v7

새 `begin_feedback_plan`의 기본은 `feedback-choice-v7`이며 HTTP 생성은 이를 명시한다. 일반 `generate_trace`의 기존 episodic 기본값은 유지한다. 명시적 v1~v6와 과거 저장 자료는 기존 계약으로 재현한다. 아래 v5/v6의 기본 채택 기록은 과거 상태를 설명하며 새 생성에는 이 v7 절을 우선 적용한다.

v7은 v6의 개인 동기·선택권을 유지하며 다음 표현을 분리한다.

- `experience.checks.cartChangedSinceLastCartView`: 실제 장바구니 확인 이후 관측·적용 결과로 확인한 변화. 닫기·목록 읽기는 기준을 초기화하지 않는다. 변화 없음은 false, 변화 있음은 true, 불확실하거나 24행동 기한이 지난 경우는 null이다.
- `rememberedItems.quantity`: 배우가 현재 원한다고 믿는 총수량. 선택적 `rememberedCartQuantity`는 마지막으로 담겨 있었다고 기억하는 수량이며 `source`는 list/personal/uncertain 중 배우가 믿는 출처다. 틀린 값·누락·불확실성을 허용하고 코드가 채우거나 정답과 대조하지 않는다.
- 담기·빼기의 `choiceParameters.quantity`는 추가·제거할 개수다. 기억의 총수량과 구분하며 실제 현재 카탈로그의 상품·수량만 선택한다. 행동 설명이 매개변수를 덮어쓰지 않는다.
- 확인은 이미 선택한 `ongoingIntent`와 구분하고, 실행 전 응답 기억을 실행 완료 사실로 취급하지 않는다. 다음 실제 결과를 보고 배우가 수정 여부를 결정한다.

상품 기억 12개·메모 8개, 최근 행동 6개·장소 6곳·24행동 기한, 원본 페르소나와 배회 신호 0.2는 유지한다. 반복 금지·자동 수량 조정·목표 복원·강제 구매나 종료는 추가하지 않는다. trace에는 feedback version 3, experienceContract `bounded-observed-experience-v2`, beliefContract `quantity-source-beliefs-v1`을 기록한다. 제품의 최대 100행동은 유지하고 사용자가 요청한 300행동은 별도 동결 실험 사본에서만 실행한다. 실제 모델 성능은 별도로 측정하며 구현 검증만으로 성공률 향상을 주장하지 않는다.

**정책 채택 상태:** feedback 기본·권장 정책은 `feedback-choice-v5`다. 현재 UI 정보 표현의 정확성과 기존 합법 행동 집합 보존 검증을 근거로 채택했으며, 성공률·인간 행동 충실도 개선을 입증한 결정은 아니다. `feedback-choice-v6`는 명시적 실험 옵션으로 유지한다. **모델 비교 결과 상태:** 2026-10-12 동일 S01에서 v5·v6 각 5회, 최대 300행동 비교를 완료했다. 두 조건 모두 관측된 목표 상품 노출·담기·완수는 0회였다. v6 1회는 1행동 뒤 선택 ID 오류로 중단돼 이후가 미관측이다. 성공률 개선은 확인되지 않았으며, 같은 궤적의 100·200·300 누적 구간과 실제 사람의 행동 타당성을 구분한다.

새 페르소나 생성의 권장 경로는 **`feedback-choice-v5`**이다. `begin_feedback_plan`의 기본은 v5이고 첫 관측을 돌려주며, `step_feedback_plan`은 행동 하나를 적용한 결과와 다음 관측을 함께 반환한다. 현재 화면과 배우가 남긴 믿음 기억에 최근 6개 적용 행동·결과와 제한된 매대·통로 관찰 경험을 전달한다. 선택적 `memory.ongoingIntent`로 진행 중인 목적을 현재 활동인 `currentTask`와 분리한다. `exploration-v2`는 실제 막힌 방향을 잠시 제외하고 기본 20%의 seed 기반 배회 신호를 제공하되, 배회·회복 모드에서도 매대 열기·확인·중단 등 현재 가능한 비이동 조작을 모두 유지한다. 이동 여부·방향·100~2000ms 입력 시간은 모델이 선택하며 구매 목적이나 보이는 대상은 필요 없다. 전체 지도·좌표·숨은 목표·정답 원장은 배우에게 주지 않는다. 정확한 목록은 읽은 직후에만 노출하고 오기억·누락·잘못된 완료 믿음을 자동 수정하지 않는다. 최대 행동 한도 100과 자동 계산 없음은 유지한다. 저장된 전체 trace를 검토한 뒤 실제 웹에서 재생하는 흐름은 유지한다. 연결·기억 형식·실패 처리·문맥 격리와 한계는 [새 생성 절차](../market-persona-skill/references/feedback-plan.md)에 있다.

HTTP provider는 `generate_trace({actorPolicyVersion:"feedback-choice-v5", feedbackMovement:{wanderProbability:0.2}, ...})`로 선택하며 매 판단에 새 system+현재 frame 메시지만 보낸다. `begin_feedback_plan`도 `feedbackMovement`를 받으며 `wanderProbability`는 0~1, 생략 시 0.2다. 정책을 생략한 일반 `generate_trace`의 기존 `episodic-choice-v4` 기본값은 유지한다. 직접 Codex 배우는 실제 Luna/low의 새 판단 문맥이 필요하며 최근 경험·`movementPolicy`를 포함한 현재 frame 전체를 전달한다. 서버가 외부 배우의 과거 문맥 삭제를 보장하지는 않는다. 새 정책은 첫 방문 생성에 적용하며 기존 learner 원장은 자동 가져오지 않는다. timing은 original이고 compact는 허용하지 않는다. v4~v6 모두 `activity-duration-v2`와 `movementContract:"joystick-direction-v1"`을 사용한다. 명시적 `feedback-choice-v3`는 `exploration-v1`의 강제 방향 이동과 기존 믿음 기억 계약, 명시적 `feedback-choice-v2`는 자동 배회·회피 없이 8방향을 제공하는 계약, 명시적 `feedback-choice-v1`은 기존 anchor 이동·관측·시간 계약을 보존한다. 명시적 v4의 프레임·합법 행동과 저장된 v1/v2/v3/v4 및 아래 whole-trace/v10 경로도 그대로 유지한다.

`exploration-v2`는 `shopping` / `world` / `activeStation` 없음인 판단에 적용한다. `actor-choice`는 일반 선택, `random-wander`는 배회를 고려하는 신호, `blocked-recovery`는 완전 막힘 뒤 다른 선택을 고려하는 신호다. v4~v6는 세 모드 모두 현재 가능한 비이동 조작을 유지한다. 완전히 막힌 방향은 다음 4회의 world 판단에서 제외하며, 실제 24px 이동 또는 관측된 위치 변경이 있으면 차단 기억을 초기화한다. 제자리 패널 열기·닫기로는 이력이 사라지지 않는다. `wanderProbability:0`은 확률 배회 신호만 끄고 막힘 회피는 유지한다. 20%는 적격 판단별 신호 발생 확률이며 실제 이동 횟수 할당량이나 임상 통계가 아니다. frame의 `movementPolicy:{version,mode,eligible,wanderProbability,roll,avoidedDirections}`, trace의 `generation.movementPolicy`와 각 step의 `movementPolicy`에 설정과 개입 출처를 남긴다. 명시적 v3의 `exploration-v1`은 배회·회복 턴에 방향 이동만 제시하는 기존 제한을 유지한다. 분석에서는 v4~v6의 신호와 실제 선택, v3의 강제 이동을 구분한다. 숨은 지도로 우회로를 찾거나 목표 상품·수량·성공을 보정하지 않으며, AI 실패를 대신하는 fallback도 아니다.

v4~v6의 `bounded-observed-experience-v1`은 최근 6개 적용 행동·관찰 결과와 최근 관찰한 매대·통로를 각각 최대 6곳씩 전달한다. 장소 경험은 마지막 관찰 뒤 24개 행동 이내로 제한하고, 매대별 상품·페이지 요약은 실제 관찰한 최대 12개 상품·12개 페이지만 담는다. 전체 방문 원장이나 정확한 쇼핑 목록의 영구 사본은 만들지 않는다. 배우는 최근 확인 뒤 새 정보가 생겼는지, 현재 보이는 장바구니와 자신의 믿음이 일치하는지를 판단하고 다음 행동이나 기억 수정 여부를 선택한다. 반복 확인·재방문·중단을 횟수 규칙으로 금지하지 않는다. `ongoingIntent`는 생략하면 이전 값 유지, 문자열이면 교체, null이면 해제하며 `rememberedItems`·`currentTask`·`notes`는 응답으로 교체한다. 이 형식은 자동 목표 보정이나 임상적 기억력 측정이 아니다. 새 trace의 `generation.feedback`에는 `version:2`, `memory:"actor-authored-with-recent-experience"`, `experienceContract:"bounded-observed-experience-v1"`, `intentContract:"persistent-intent-v1"`을 기록한다.

v2~v6의 `visibleStructures`는 매대 이름을 읽을 수 없어도 보이는 본체의 방향·거리와 익명 `진열대` 단서를 전달한다. 범주·상품·좌표·상호작용 ID를 제공하지 않으며, 가까운 버튼이나 표지로 이름이 확인된 매대와 중복하지 않는다. 보수적인 sprite/HUD 기하 투영이며 실제 픽셀의 모든 가림을 판정하는 기능은 아니다. 본체 단서는 방향 이동의 전제 조건이 아니며, v3~v6의 회피는 실제 관측된 막힘만 이용한다.

기본 `feedback-choice-v5`는 v4의 합법 행동을 유지하면서 화면 정보와 선택의 표현을 보완한다. `begin_feedback_plan`은 생략 시 v5를 사용하며, HTTP `generate_trace`에서는 `actorPolicyVersion:"feedback-choice-v5"`를 명시한다. 담기·내려놓기를 각각 하나의 선택지와 현재 상품 `catalog`로 묶으며, 같은 모델 응답의 `choiceParameters`로 상품·수량·담기 결과를 고른다. 예를 들어 현재 카탈로그에 해당 상품과 수량이 있을 때 담기 매개변수는 `{"productId":"curry","quantity":2,"dragOutcome":"drop"}`이다. add는 세 필드가 모두 필요하고, remove는 `productId`와 `quantity`만 받는다. 실패 `miss`·취소 `cancel`은 기존과 같이 수량 1에서만 가능하다. 그 밖의 선택에는 `choiceParameters`를 생략한다. 기본 상품·수량을 대신 채우거나 목표를 우선 정렬하지 않으며, 기존 v4의 합법 행동 집합을 유지한다. [전체 응답 예제와 검증 규칙](../market-persona-skill/references/feedback-plan.md#v5-기본과-v6-실험-계약)을 참고한다.

v5/v6에서만 현재 열린 장바구니·계산 화면에 `cartItems:[{id,name,detail?,quantity}]`를 전달한다. detail은 해당 UI가 표시할 때만 포함하고, 구매 버튼은 실제 화면의 `구매 확정` 및 `구매를 확정하면 이번 시도가 기록되고 결과가 나와요.` 효과를 전달한다. 계산 화면의 닫기는 `다시 고르기`로 매장에 복귀한다. 정답과의 자동 비교·부족 수량·제출 전 추가 확인이나 성공 조건 검사는 넣지 않는다. `cartItems`는 기존의 열린 장바구니 패널 전체 관측 계약에 상품명을 보완한 것으로, 스크롤 밖 행·가림을 픽셀 단위로 재현한 것은 아니다. 장바구니가 닫힌 뒤 현재 내용으로 계속 제공하지 않으며 미관찰 상품·재고를 추가하지 않는다.

명시적 `feedback-choice-v6`는 v5와 같은 관측·선택지에 지시문만 조정한 비교 후보다. 원래 개인의 장보기 동기와 강점, 현재 기억·관찰에 근거한 구체적 활동을 기존 `currentTask`·`ongoingIntent`에 표현하도록 하되, 기억 슬롯·보존 기간·목표 복원·반복 금지·즉시 목표 복귀·강제 완수는 추가하지 않는다. v5/v6 모두 페르소나 원본, 믿음 기억의 용량·교체 방식, 최근 경험 한도, `exploration-v2`와 기본 배회 신호 20%, 행동 시간·게임 규칙을 v4와 공유한다. 기존 v1~v4의 관측·선택지·지시문과 저장된 자료는 그대로 유지한다. 제품 경로의 feedback 기본·최대 행동 수는 **100**이고 자동 계산을 추가하지 않는다. **300행동은 별도 승인된 동결 실험 경로에서만** 사용하며 제품 한도가 바뀌었다고 설명하지 않는다. v6의 채택 여부와 모델 효과는 같은 개인·조건의 비교 결과, 관찰 기회와 기술 중단을 검토해 별도로 판단한다.

페르소나 충실도 검증은 공통 성향 5축과 유형 5개의 조합을 평가한다. 기존 MCP 도구 5개를 재사용하고, 같은 맥락에서 성향 하나만 다른 표본 비교·기회 미발생 구분·A/B 성향 추정·원본 불변 검사를 제공한다. 일반 생성 경로에서 자동 실행하지 않는다. 자세한 입력·출력·분모·한계와 기존 v2 호환 절차는 [검증 절차](../market-persona-skill/references/persona-validation.md)를 따른다.

페르소나 생성기는 `walkTo`, `readList`, `browse`, `openShelf`, `dragProduct`, `viewCart` 같은 행동 **의도**를 JSON으로 만든다. 개발용 Expo 웹앱이 전체 trace를 받아 기존 이동·버튼·드래그 입력 경로로 실시간 재생한다. 게임 로그는 앱의 기존 `MarketBehaviorTracker`와 큐가 기록·전송한다. 생성기와 MCP에는 `BehaviorLogRequest` 생성·변환·직접 전송 기능이 없다.

Luna 전체 계획 경로는 전체 세계를 전개 계산용 참고 자료로 전달하되 인물의 관찰 사실 원장과 현재 작업 기억을 분리한다. 실제 Codex Luna가 각 행동의 상태·사용 기억·근거와 종료까지의 배열을 한 번 작성하고 Node가 제출 후 화면 전개와 기억의 출처·일관성을 검사해 앱용 trace를 저장한다. 코드가 계산한 상태를 Luna의 다음 판단에 실시간 주입하거나 행동마다 모델을 호출하지 않는다. 전체 세계가 모델 문맥에 있으므로 사후 감사는 숨은 정보 영향 차단을 입증하지 않는다. 기존 generate_trace는 실제 LLM이 다음 행동을 선택하는 증분 방식이며, 행동 전부를 결정하는 확률 회귀 정책은 mode:"stochastic"에 한정한다. v4의 `exploration-v2` 신호·막힘 회피와 명시적 v3의 `exploration-v1` 선택 제한은 이와 별개이며 구체적인 방향·시간은 모델이 고른다. 생성기의 가상 시간·좌표·이벤트를 앱에 전송하지 않는다. 화면 재생의 시간과 위치는 실제 앱이 결정한다.

이 기억·이동 정책 구현만으로 대규모 AI 표본이나 클리어 검증 실험을 자동 실행하지 않는다. fixture 테스트를 실제 AI 실행으로 보고하지 않으며, 과거 v1/v2/v3 실험의 frame·추론·trace·보고서 원본은 수정하지 않는다. 별도로 승인된 비교에서는 새 정보 없는 재확인·같은 장소 재방문, 배회·회피 개입과 모델 선택, 상품 관측 기회와 실제 담기, 완성·기술 실패·구매 성공을 각각 집계한다.

정책 옵션·learner 신원 없이 호출한 `generate_trace`는 기존 `episodic-choice-v4` 프롬프트·C1부터 시작하는 선택 ID·선택 순서·300회 기술 상한을 유지한다. `actorPolicyVersion:"episodic-choice-v9"` 또는 `create_learner`로 만든 v9 신원의 `learnerFile`을 명시하면 새 provider 정책을 선택한다. 아래 Codex 직접 증분 계획과 전체 계획도 별도 도구로 명시적으로 시작한다.

현재 Codex 모델이 직접 actor 행동을 고르는 증분 경로는 MCP의 `begin_actor_plan` → `observe_actor_plan` → `append_actor_plan` → `finalize_actor_plan`이다. `append_actor_plan`은 현재 revision의 choice ID 1~3개와 행동마다 `delayMs`/`reasons`를 받는다. 수락된 첫 행동 뒤 현재 actor 관측과 choice ID 집합이 달라지면 나머지 계획을 버리고 새 관측을 요청한다. 항상 3개를 채우지 않는다. 이 모드는 `gpt-6-luna` / `low`, actor policy `episodic-choice-v10`, trace policy `6`으로 표시되고 외부 LLM API 키가 필요 없다. 전체 계획은 아래 별도 도구를 사용한다. 두 경로 모두 생성된 전체 trace를 일반 `validate_trace` 후 `play_trace`로 앱에 전달한다.

## 공통 성향 기반 충실도 검증

새 run은 `validationMode:"traits"`로 명시할 수 있다. `profiles`는 `{id, basePersonaId, presetId?, traits?, label?}` 형식의 1~32개 인물이고 `personaIds`와 함께 쓰지 않는다. `basePersonaId`는 기존 세 인물 또는 `neutral-adult-control`이며, 유형 기본값에 `traits`의 일부 축을 덮어쓴다. 유형을 생략하면 모든 축은 `medium`에서 시작한다. 사용자 정의 ID는 경로에 안전한 소문자 영문·숫자·`_`·`-` 1~64자이고 첫 글자는 영문 또는 숫자여야 하며 기존 ID와 겹치지 않아야 한다.

| 성향 키 | 의미 | 수준 |
| --- | --- | --- |
| `deliberation` | 선택 전 후보·조건 숙고 | `low / medium / high` |
| `checking` | 목록·수량·장바구니 확인 | `low / medium / high` |
| `exploration` | 새로운 단서·관심 상품 탐색 | `low / medium / high` |
| `persistence` | 어려움 뒤 지속·전략 변경 | `low / medium / high` |
| `helpSeeking` | 불확실할 때 도움 활용 | `low / medium / high` |

유형 ID는 `deliberate-checker`(숙고·확인형), `quick-satisficer`(신속 결정형), `curious-explorer`(탐색·호기심형), `familiar-routine`(익숙함 선호형), `help-seeker`(도움 활용형)다. [카탈로그](validation/persona-traits.json)에 수준별 지침과 기존 인물의 설계 매핑을 저장한다. 이 유형·수준은 심리검사 점수가 아니다. 성향을 바꿔도 기본 인물의 숫자 인지·반응·보행 기준, 상품 취향과 친숙함은 유지한다. 새 배우 지시문은 기존의 상충하는 성격 서술을 공통 성향 지침으로 대체하며 원본 인물 파일은 바꾸지 않는다.

숙고는 실제 관찰한 관련 후보·복수 조건을 살필지, 확인은 다음 목표 전환·불확실한 수량·결제 시 어떤 정보를 대조할지에 반영한다. 낮은 수준도 필요하면 확인할 수 있고 모든 수준은 충분히 명확해지면 멈춘다. 고정된 행동·실수·도움 횟수를 요구하지 않는다. 닫기·이동·대기나 `check` 표기만으로 실제 확인을 대신하지 않는다. 같은 페이지의 후보를 살필 수 있지만 별도 UI 행동 없는 설명은 배우 선언이며 독립적으로 측정한 비교 행동이 아니다.

새 사용자 정의 프로필 버전 `traits-2-<hash>`는 실제 프롬프트를 포함한 작성 내용을 반영한다. 수행 기준·취향·경험이 같으면 비교용 `contextHash`는 유지된다. 카탈로그·작성 지침 변경 후에는 새 runId와 bundle을 사용한다. 과거 저장 자료는 다시 쓰지 않으며, hash가 달라진 과거 run을 현재 코드로 그대로 재측정할 수 있다는 뜻은 아니다.

새 run은 **조건별 seed 20개 이상**을 권장한다. 20개 미만도 허용하며 준비 응답의 `powerWarning`에 표시한다. 절차는 준비 → `check_persona_validation_readiness({runDirectory})` → 부족 슬롯의 `prepareWholeTrace`로 생성 → readiness 재확인 → measure → 다중 블라인드 → report다. readiness는 인물×조건 완료 수, 대조군·짝 불일치, 지표별 최대 유효 쌍 상한과 부족 슬롯을 읽기 전용으로 반환한다. 대조군 또는 비교 가능한 쌍이 없으면 측정 응답과 보고서 상단에 `readiness:"blocked"`와 이유를 기록한다. v3의 비교 기준은 같은 맥락·단일 성향 대비 프로필이다.

검증 전용 snapshot은 `scripts/build-validation-snapshots.cjs`로 새 디렉터리에 만들며 기존 snapshot을 덮어쓰지 않는다. 준비 manifest의 `opportunityAudit`는 구조적 기회와 불가능 경고를 기록한다. 구조적 가능성이 실제 노출·오류·회복을 보장하지는 않는다.

새 `sequenceMetrics`는 대기시간 분포·전이·오류 근거·회복·반복을 설명하며 `descriptiveOnly:true`다. `pooledAnalysis`는 low/high 층화 쌍 부트스트랩, `powerAnalysis`는 고정 seed의 가정 기반 검정력이며 둘 다 주 판정에 사용하지 않는다. 유효 쌍 8·|delta| ≥ 0.33·95% CI의 0 제외·플래그 10%는 유지한다. **실수 강제 금지**: 오류가 많다고 장애 특성에 충실하다고 해석하지 않는다.

다중 판별은 준비·제출의 `reviewerId`, 제출의 `reviewerKind:"llm"|"expert"`로 구분하고 판별자마다 A 채점 뒤 B, 채점 답안 동결을 지킨다. `blindReviews`에 판별자별 점수, `interReviewerAgreement`에 Cohen’s κ(2명)/Fleiss’ κ(3명 이상)를 보고한다. 기존 단일 `blind-review.json`도 읽는다. [전문가 안내](../market-persona-skill/references/blind-review-guide.ko.md)와 [상세 입출력·한계](../market-persona-skill/references/persona-validation.md)를 따른다. 실제 사람 자료는 수집·비교하지 않으며 `referenceComparison:null`과 [확장 메모](../market-persona-skill/references/persona-validation-extension-design.md)만 남긴다. 기존 spec 원문은 validation/archive에 보존하고 새 명세(legacy v3/traits v2)는 새 run에만 적용한다.

다음 `prepare_persona_validation` 예시는 같은 기본 맥락에서 확인 성향만 다른 두 인물을 준비한다. 8개 seed × 2조건 × 2인물 = 32칸을 만들며 모델 생성은 자동 실행하지 않는다.

```json
{
  "validationMode": "traits",
  "runId": "checking-contrast-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {"low":"/absolute/low.json","high":"/absolute/high.json"},
  "seeds": ["s01","s02","s03","s04","s05","s06","s07","s08"],
  "profiles": [
    {"id":"checking-low","basePersonaId":"neutral-adult-control","presetId":"deliberate-checker","traits":{"checking":"low"}},
    {"id":"checking-high","basePersonaId":"neutral-adult-control","presetId":"deliberate-checker","traits":{"checking":"high"}}
  ]
}
```

반환된 각 `slot.prepareWholeTrace`를 그대로 사용한다. **슬롯마다 새 `gpt-6-luna / low` 문맥**에서 bundle 하나의 전체 계획을 작성·제출하며, 다른 인물·조건·검증 점수를 함께 주지 않는다. 사용자 정의 인물은 검증 manifest에 바인딩된 전체 계획 scope에서만 사용할 수 있고 일반 인물 목록·확률/증분 생성·learner 등록으로 확대되지 않는다. first-play만 사용하며 앱 재생은 별도 요청과 절차다.

새 `authoringGuide` v2는 읽고 선택한 열린 목표와 실제 관찰한 상품의 focus 예시를 제공한다. `null` 예시를 모든 결정에 복사하거나 실제 선택 오류를 정답에 맞춰 수정하지 않는다. 닫기 예시는 그 자체로 확인이 아니다. candidate의 최상위 키는 `candidateVersion`, `requestId`, `decisions` 세 개뿐이다. 입력 식별용 `inputHash`·`snapshotId`·`personaId`·`seed`는 candidate에 추가하지 않는다.

저장 후 `measure_persona_validation({runDirectory})`를 호출한다. 비교 쌍은 `contextHash`가 같고 나머지 네 성향이 같을 때만 만들어지며 동일 조건·seed에서 실제 평가 기회가 있었던 표본을 사용한다. 높은 설정 수준 대비 낮은 수준을 비교하므로 `high-low`뿐 아니라 `high-medium`, `medium-low`도 포함한다. 여러 유형이 함께 다른 집단의 집계는 설명적이다. 위 예제에서 효과 비교 대상은 확인 성향뿐이다. 같은 seed는 비교 식별자이며 native 모델 난수·동일 출력을 보장하지 않는다. 유효 쌍 8개 기준은 생성 슬롯 8개와 다르다. Cliff’s delta는 두 집단 전체 분포를 비교하고 부트스트랩은 seed 쌍을 함께 재표집한다. 인접 수준에도 같은 |delta| ≥ 0.33 기준을 적용하며, 이는 아직 실험적으로 보정하지 않은 설계값이다.

보고서는 네 축을 나눈다: 기술적으로 저장된 trace·누락 슬롯, **전체 목표**의 시도·충족·미시도·종료 결과, 성향 표현, 실제 평가 기회와 근거 충분성. 어려움의 관찰 근거 없이 미완료 목표를 남기고 포기하면 검토 신호를 남기며 자동 성격 실패로 처리하지 않는다. 시도한 목표의 불일치율을 전체 목표 달성률과 혼동하지 않는다. 도움 사용·낮은 정확도·오류/관심 횟수의 분산 0은 검토·정보 신호이며 자동 실패가 아니다. 금지 패턴 실패는 명시된 위반에만 적용한다. 관찰된 행동·작성된 시간·배우 선언도 구분한다. 누락 슬롯에는 미시도와 기술 실패가 함께 포함되므로 별도 요청 기록 없이 생성 실패율을 추정하지 않는다.

작성 가이드 v2 자료의 제출 결과와 `.persona-review.json`에는 선택적 `annotationReview`(`reviewVersion:"actor-annotation-v1"`)가 있다. 닫기와 `check` 표기·focus 불일치에 대해 자체 `status`, `findings`, 결정별 근거, `improvementTarget`, `recommendation`을 제공한다. 상위 review가 `clear`여도 별도 주석 검토는 `review`일 수 있으므로 각각 읽는다. 과거 가이드에 항목이 없다는 사실을 통과로 해석하지 않는다. 검토 신호는 주석 보완용이며 행동 변경·추가 확인·성향 실패를 요구하지 않는다.

측정의 `measurements.perTrace[i].annotationReview`와 JSON 보고서 `annotationReviews[{personaId,condition,seed,tracePath,review}]`에 이 결과를 전달하고, 항목이 없으면 검토 값을 `null`로 둔다. 한국어 보고서 **행동·focus 주석 정합성**에는 발견 근거와 권장 조치가 표시된다.

성향 주 판정은 `behavioralEvidence`만 사용하고 `authoredTiming`은 별도로 보고한다. 작성 시간 차이가 행동 근거의 부족을 보충하지 않는다. 관찰된/예상 비교 수(`exercisedComparisons / expectedComparisons`)를 표시하며, 일부 행동 비교가 미발생이면 나머지가 모두 pass여도 `partial`이다. 모두 미발생이면 `unexercised`, 표본 부족이 하나라도 있으면 `insufficient`로 남긴다.

`prepare_blind_review({runDirectory,panel:"A"})`는 공통 `traitRubric`, `publicStyles`와 익명 판을 제공한다. 새 판별 문맥은 이것만 읽고 개인별 프로필·manifest·정답 키·측정 결과는 읽지 않는다. A는 행동·시간, B는 여기에 이유를 더하며 A 채점 후 B를 준비한다. B 판단 전에 A 점수·정답을 알려주지 않는다. 새 모드의 `submit_blind_review` 답안은 인물 ID 대신 다음 형식이며 실제 판의 모든 opaque ID를 포함해야 한다.

```json
{
  "runDirectory": "/absolute/output/checking-contrast-01",
  "panel": "A",
  "answers": {
    "opaque-id-from-panel": {
      "traits": {"deliberation":"medium","checking":"high","exploration":"unknown","persistence":"unknown","helpSeeking":"unknown"},
      "confidence": 0.6
    }
  },
  "reviewerModel": "self-reported-model",
  "reviewerSession": "self-reported-new-session"
}
```

다섯 축마다 `low / medium / high / unknown`을 답한다. `confidence`는 선택적 0~1이다. `unknown`은 정확도의 분모에 남으며, 축별 정확도와 판별 비율을 함께 보고한다. 고정된 25% 우연 정확도나 장애 분류를 적용하지 않는다. A/B는 같은 표본이고 독립적인 두 반복이 아니며 판별 세션의 독립성·정답 미열람은 자기 신고다. 마지막 `persona_validation_report({runDirectory})`가 JSON·한국어 보고서를 저장한다.

새 공통 성향 run은 manifest `version:3`이다. `profiles`와 `personaIds`를 모두 생략하면 기존 세 인물을 설계 성향에 매핑한다. 기존 네 ID를 모두 전달하는 과거 `personaIds` 형식은 모드를 생략하면 legacy로 유지한다. 같은 네 ID에 공통 성향을 적용하려면 `validationMode:"traits"`를 명시한다. `validationMode:"legacy"`와 저장된 v2 run은 [기존 네 인물 고정 검증](../market-persona-skill/references/persona-validation.md#legacy-v2--기존-네-인물-고정-검증-절차와-구현-기록)을 유지하며 v2/v3 자료를 섞지 않는다.

공통 성향 구현 테스트와 `allowFixture:true` 자료는 파이프라인 확인용이다. 이번 지침 보완으로 새 LLM 실험의 행동 개선 효과를 입증한 것은 아니며, 계획 검증은 실제 앱 수행·DB 수신·사람 행동의 타당성을 증명하지 않는다.

## Luna 전체 계획 생성

실제 Codex 세션을 `gpt-6-luna` / `low`로 설정하고 지속형 MCP 또는 `node market-simulator/cli.cjs interactive`에서 실행한다. MCP는 모델을 전환하거나 Luna 세션을 자동 생성하지 않는다. 다른 모델의 감독 세션은 사용자가 이양을 허용한 기존 Luna 세션에 전체 계획 작성을 맡긴다. 서버의 모델 라벨은 실제 세션 설정·내부 API 호출 횟수의 증거가 아니다. 전체 계획 생성에는 학교 Qwen 서버·API 키·SSH 터널이 필요하지 않으며 앱 재생·분석은 기존 서비스 연결을 사용한다.

한 인물·한 조건·한 seed·한 request/bundle마다 새 actor 작성 문맥을 사용하고 저부하·고부하 bundle을 같은 문맥에 함께 주지 않는다. `requestId`·`bundle.inputHash`를 후보 출처로 기록하고 새 `bundle.authoringGuide`(`authoringVersion:"2"`)의 식별 정보·문법·상태 전이 예제를 확인한다. 저장된 가이드 v1은 그대로 보존한다. 호스트 MCP는 여러 요청을 관리할 수 있지만 서버가 actor 문맥 분리를 강제하거나 입증하지는 않는다. `taskUpdate`는 한 건도 배열이며 `basis.intent`와 `actorState.activity`의 허용값은 서로 다르다. 직전 행동 결과와 같은 결정의 taskUpdate를 반영한 행동 직전 상태를 작성한다. 세부 규칙은 [작성 시점과 문법 확인](../market-persona-skill/references/whole-trace.md#작성-시점과-문법-확인)을 따른다.

1. `prepare_whole_trace({personaId,seed,tabId})` 또는 시작 전 `snapshot`/`snapshotFilePath`로 불변 입력 패키지를 준비한다. 출력은 `{requestId,bundle}`이다. `outputPath`, `learnerFile`, `maxRepairs`도 지정할 수 있다.
2. Luna는 전체 맵·상품·재고·목표를 다음 화면과 행동 결과를 예상하는 세계 참고 자료로 사용한다. 인물의 선택에는 그 시점에 보이는 단서·발견 기억·같은 프로필 JSON의 상세 개인 지침을 사용해 **전체 행동 배열과 단계별 상태·근거를 직접** 작성한다. 아직 읽지 않은 목록·열지 않은 상품 페이지·화면 밖의 미발견 위치는 인물이 알고 있는 사실이 아니다. 코드가 행동마다 정답이나 확률 선택을 대신 넣지 않는다.
3. `submit_whole_trace({requestId,candidate})` 또는 `{requestId,candidateFilePath}`로 전체 배열을 제출한다. Node가 기존 attention loop·`projectDecision`·`TraceGuard`·게임 어댑터로 컴파일하고 최종 구조/의미 검증 후 파일을 저장한다. 정상 흐름에서는 별도 finalize가 필요 없다. `whole_trace_status({requestId})`로 상태와 저장 결과를 다시 확인할 수 있다.
4. 요청이 생성·검증뿐이면 파일 저장에서 끝낸다. 앱 실행까지 요청받았다면 `validate_trace` → `play_trace` → `replay_status`로 전체 trace를 전달하고 실제 실행을 확인한다.

기술 수정이 허용된 실패에는 `repair_whole_trace({requestId,repair:{decisions:[...]}})`로 수정할 suffix만 보낸다. `repairFilePath`도 같은 `{ "decisions": [...] }` 객체를 받는다. 서버가 요청·버전·수정 시작 위치를 채우고 이미 수락한 prefix와 원래 종료 의도, 수정 1회 제한을 유지한다. 기존 명시형 wrapper도 지원하며 잘못 명시한 값은 거절한다. 별도 사전 검사 왕복이나 행동별 AI 호출을 추가하지 않는다.

계산대 참조는 `checkout/<계산대 ID>`(예: `checkout/checkout`)이며, 수락 뒤 source의 `phase:"checkout"`, `view:"world"`, `activeStation:<해당 계산대 ID>`, `pageIndex:null`과 기존 위치·navigationStateId를 이어 쓴다. 직원이 있고 제출을 선택할 때 `control/submit`을 사용한다. 새 catalog의 `referenceAliases` 배열은 `{aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"}`로 같은 계산대의 `open/<ID>` → `checkout/<ID>` 별칭만 명시한다. 정확한 현재 source·실제 계산대 대상·현재 사용 가능한 정식 버튼을 모두 확인해 로컬에서 연결하며, 별칭 없는 저장 bundle은 기존 엄격한 해석을 유지한다. 원본 후보는 보존하고 `choiceResolution.choiceRef`에 작성 참조, `resolvedChoiceRef`에 실행 참조, 별칭 사용 시 `normalization:{kind,authoredChoiceId,canonicalChoiceId}`를 기록한다. 다른 대상·경로·수량·이유·지연·종료를 자동 수정하지 않으며 추가 AI 호출 없이 전체 계획 1회·최대 1회 기술 수정 구조를 유지한다.

기본 후보 형식은 bundle 8 / candidate 7이다. 각 결정은 `{choiceRef:{source:{location,navigationStateId,phase,view,activeStation,pageIndex},choiceId,quantity?},delayMs,reason,basis:{intent,goalId,cueRefs?,memoryUses},actorState}`를 사용한다. `goalId`는 필수이며 task/recover는 열린 목표 ID, check/help는 열린 목표 ID 또는 null, explore/interest/rest/finish는 null을 쓴다. 과제를 위한 이동과 행동은 focus와 별개로 goalId에 연결한다. `memoryUses`는 필수 배열이며 목표 세부를 쓰지 않으면 `[]`다. 항목은 `{goalId,field:"name"|"specification"|"requiredQuantity",mode:"remembered"|"guess"|"current-display",value}`다. value는 필수이고 name/specification에는 문자열, requiredQuantity에는 숫자를 쓴다. 기억·추정·현재 표시값의 검사는 아래 기억 계약을 따른다.

`actorState.taskUpdate`는 선택적 `[{type:"select"|"complete"|"abandon",goalId}]` 배열이다. 선택된 `openGoalIds`는 관심·탐색·focus null에서도 유지되며 `heldGoalIds`는 열린 목표와 같은 집합으로 프로필 기억 용량 안에 둔다. 목록을 실제 읽은 다음 관찰에 열린 목표가 없고 보이는 목표 중 명시적 완료 이력이 없는 목표가 있으면 보이는 목표를 하나 이상 선택한다. 예외는 실제 checkout/submit/requestCashier/giveUp 행동이며 finish label만으로는 선택을 건너뛰지 않는다. select는 현재 실제 목록 또는 같은 결정의 명시적 selfRecall 이름 belief를 사용한다. complete는 그 목표에 연결한 이전 add의 실제 수락 결과를 관찰한 뒤 선언하며 올바른 상품·수량을 담았는지 검사하지 않는다. 포기는 abandon으로 명시할 수 있지만 pending 목표를 held 배열이나 memoryUpdate.deactivate만으로 조용히 지울 수 없다. 첫 readList 전 goal focus는 null이고 상품 focus는 실제 선반/cart에서 본 상품만 가리킨다. Goal focus는 이 방문에서 읽고 heldGoalIds에도 든 목표만 허용하며 uncertain과 겹칠 수 있다. source는 실제 행동 직전 상태와 일치해야 하고 choiceId는 그 source의 선택지에서 고른다. quantity는 add/remove에 필수이고 보이는 재고·반환 범위의 정수를 명시한다. 기본값·정답 수량을 대신 넣지 않으며 합법적인 오구매와 관심 구매도 그대로 기록한다. legacy 6은 기존 기억 계약, 5는 focus 계약, 4는 source-bound 선택, 3은 직접 action과 필수 cue 배열의 의미를 유지한다. 형식을 섞거나 기존 파일을 바꾸지 않는다. 1~100개의 행동을 받으며 100회 전에는 submit 또는 자발적 giveUp으로 끝나야 한다. 100회 후에도 진행 중일 때만 당시 장바구니 그대로 시스템 계산을 붙인다.

`taskMemory.completedGoalIds`는 수락된 명시적 완료 선언만 기록한다. 표시된 목표가 모두 완료된 뒤의 목록 재확인은 재선택 없이 장바구니 확인·이동으로 이어갈 수 있다. 재선택하면 완료 이력을 해제하고 abandon은 완료로 세지 않는다. 완료 이력으로 구매 정답을 판정하거나 기억 세부를 복원하지 않는다.

`bundleVersion:"8"`에는 전체 세계 참고 자료, choiceCatalog·initialChoiceFrame과 초기 `actorState.workingMemory`, 과제 계약이 있다. 전체 catalog는 전개 참고이며 현재 source의 frame만 가능한 선택을 정한다. `persona.behavior`는 같은 JSON에서 추출한 개인 지침, 목표 기억 용량, timingBaseline, 상황별 인지 설정 `cognition`과 `cognitionSourceHash`를 제공한다. 관심 전환 뒤 세부 기억·유사 상품 구분·수량 추적 설정은 합성 부담을 연결하며 강제 오답 확률이나 임상 척도가 아니다. source parameters와 페르소나 성격을 다시 정의하지 않는다. 표시된 사실의 원장인 actorState.knowledge와 현재 작업 기억, 계속 수행 중인 과제 목표를 구분한다. readList 다음 관찰의 목록값만 명확한 목록 기억의 출처가 되고 cart는 실제 담긴 수량만 알려준다. 목표 규격은 표시된 label 범위를 넘어 숨은 정답에서 추출하지 않으며 별도 규격이 없으면 unavailable일 수 있다. 상세 계약과 예시는 [전체 계획 절차](../market-persona-skill/references/whole-trace.md#관찰-원장과-작업-기억)를 따른다.

각 판단의 필수 actorState는 candidate 7에서 `{activity,task,heldGoalIds,uncertainGoalIds,focusedGoalId,focusedProductId,orientation,triggerCueRefs?,memoryUpdate?,taskUpdate?}`이며 행동 직전의 허구 상태를 요약한다. 작업 기억과 과제 snapshot은 코드가 계산하고 모델이 덮어쓰지 않는다. optional memoryUpdate는 `{type:"selfRecall",goalId,values:{name?,specification?,requiredQuantity?}}`, `{type:"deactivate",goalId}`, `{type:"uncertain",goalId,fields:[...]}` patch 배열이다. deactivate는 열린 과제의 complete/abandon을 대신하지 않는다. selfRecall은 선언값을 uncertain belief로 기록하며 원장의 정답을 복사해 clear로 바꾸지 않는다. remembered 값은 계산상 clear 기억값과 일치해야 하고 guess는 uncertain belief, current-display는 현재 readObjectives 값과 일치해야 한다. unavailable인 필드는 실제 목록 재확인이나 selfRecall 없이 사용할 수 없다. 활성 목표의 필수 세부가 불확실하거나 unavailable이면 uncertainGoalIds에 그 목표를 포함한다. non-null basis.goalId는 focus와 무관하게 name 사용이 필요하되 실제 readList/viewCart/viewHelp는 기억 없이 외부 확인을 먼저 할 수 있다. 관심 이외의 add/remove는 goalId가 필요하며 목표에 연결된 add/remove에는 name·requiredQuantity 사용을 선언한다. non-null goal focus는 basis.goalId와 같아야 한다. 선택한 상품·수량의 정답 검사는 하지 않는다. 실행 대상/control과 objective proof는 기억 사용·정확 회상 근거를 대신하지 않는다. task는 최대 160자의 관찰 가능한 활동이고 trace currentTask로 연결한다. 상태·지연·근거는 내면 사고나 측정된 심리 상태가 아니다. 역할 검토는 별도 soft warning이며 행동을 정답으로 교정하지 않는다.

`worldReference.navigation.states`는 방향이 있는 이동을 예상하기 위한 참고다. 각 결정에서 실제 허용 선택은 current source와 일치하는 choice frame의 available choice IDs로 정한다. 지도상 이웃이나 future choice가 현재 선택 frame에 없으면 바로 고를 수 없다. 다음 선택은 개인의 관심·목표·확인·배회 의도로 고르고 재방문·휴식·도움을 허용한다. 최단 경로/목표 상품 정답 선택기는 없다.

전체 세계와 waypoint 자료는 `worldReference`에 유지하고 기본 bundle의 생성기 원문 `generatorReference`는 연결 정보로 교체한다. `sourceFiles` 경로·SHA-256 출처 목록은 보존한다. 참고 코드는 모델 안에서 실행되지 않으며, 입력 구성 변경의 실제 시간 효과는 별도 측정한다.

기본 `maxRepairs:0`은 일괄 제출 1회다. `maxRepairs:1`이면 실패한 첫 후보의 `repairContext`를 받아 `repair_whole_trace({requestId,repair})` 또는 `repairFilePath`로 단 한 번 뒤쪽 suffix를 제출할 수 있다. 권장 repair payload는 `{decisions:[...]}`이며 서버가 요청·버전·수정 시작 위치를 채운다. 기존 전체 wrapper를 제공하면 명시한 값의 일치를 검사한다. 행동 suffix는 `repairContext`의 최신 before/source/choiceFrame/known facts를 기준으로 고친다. 서버는 수락된 정확한 prefix와 원래 종료 의도를 보존한다. 같은 persistent MCP/CLI interactive 프로세스에서 `repair-whole` 별칭도 쓸 수 있다. 상품 정답률·최단 경로를 최적화하지 않는다. 원본·수정본과 제출/수정 횟수를 보존한다. 미완성 계획을 완성 trace나 실제 경험으로 저장하지 않는다.

actor policy는 whole-trace-v3, trace schema 2 / policy 6을 유지한다. 새 기본 bundle/candidate는 8/7이고 actorStateVersion:"1"도 유지한다. candidate 7은 knowledge audit auditVersion:"6", taskContract:"persistent-task-memory-v1"·taskStateVersion:"persistent-task-v1"와 기존 memoryContract:"working-memory-v1", cognitionVersion:"context-cognition-v1"를 기록한다. actionBinding:"state-bound-choice-v1"·focusContract:"explicit-focus-v1"도 유지한다. legacy 6/5/4/3은 각자 기존 audit 5/4/3/2와 검증 의미를 유지하며 저장된 trace 재생을 바꾸지 않는다. 관찰 사실, 계산한 열린 목표·작업 기억, 과제 전이와 기억 사용·갱신 선언을 sidecar audit에 기록한다. 전체 세계를 받는 observationScope:whole-world와 선언된 actorKnowledgeScope:observed-and-remembered의 한계는 유지된다. 정책 이름이 같아도 과제·기억 계약이 다른 표본을 같은 생성 조건으로 비교하지 않는다. 사후 감사 통과는 실제 Luna의 인지 과정·앱 실행·DB 수신·임상적 재현을 검증하지 않는다. 새 모델 호출의 seed 동일 출력과 시간 개선도 별도 측정 없이 주장하지 않는다. Codex 내부 추론/API 횟수는 미확인이면 그대로 두고 실제 계획 제출 수·도구 호출 수를 보고한다.

전체 계획용 개인은 `create_whole_trace_learner`로 새 파일을 만든다. 이전 `whole-trace-v1`/`whole-trace-v2`·provider·Codex 증분 정책의 learner·trial과 섞거나 정책 값을 수동 변경하지 않는다. 실제 앱 실행·DB 수신을 검증한 경험만 `learnerFile`로 넘기고, 시스템 계산 구간은 개인 기억·독립 완수 비교에서 제외한다. `whole-trace-v3`로 만든 새 A/B/C trial은 `prepare_whole_trace({trialFile,arm,tabId,...})`가 기존 회차 준비·기억·분석 연결 조건을 적용한다. 후보 제출 후 실제 앱/DB 증거는 기존 `record_learning_round`로 기록한다. 구체적인 후보·interactive·반복 실험 예시와 페르소나 지침은 [전체 계획 스킬 절차](../market-persona-skill/references/whole-trace.md)에 있다.

역할 표현의 자동 검토는 `actor-fidelity-v2`이며 `<trace 경로>.persona-review.json`과 결과의 `personaReviewPath`·`personaReviewHash`·`personaReview`에 별도 저장한다. `status:"review"`의 경고는 코드·판단 인덱스·설명과 함께 보고하고, `status:"clear"`는 자동 경고가 없다는 뜻으로만 해석한다. 실제 accepted add의 상품→목표 matcher 전이와 focus 변화, 지민의 다음 목표 목록 재확인, 제품/goal focus mismatch, 선언된 관심 복귀·불확실성 해소의 단서 연결을 soft warning으로 검토한다. 경고 코드는 `UNIFORM_REACTION_DELAYS`, `NEXT_GOAL_WITHOUT_LIST_RECHECK`, `INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY`, `FOCUS_ACTION_MISMATCH`, `FOCUS_GOAL_SELECTION_MISMATCH`, `UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE`다. `summary`는 `decisions`, `distinctReactionDelays`, `activityCounts`, `maximumHeldGoals`, 실제 선택 목표 기반 `goalSwitches`, `focusGoalSwitches`, `productSwitches`, `interestReturns`를 기록한다. `focusCoverage`는 기록된 판단과 focus 미기록 인덱스를 나누고, `transitions`는 purchase-goal/focus-goal/interest-return/uncertainty-cleared 인덱스와 cue·check/listRechecked 정보를 보존한다. purchase-goal에는 `selectionFocus:"consistent"|"unrecorded"|"different-goal"|"no-goal"`을 기록한다. `situations.unfamiliar`는 초기 orientation·국소 cue·새 매대, `situations.memoryLoad`는 실제 읽은 목표 수와 설계 용량·선언 uncertainty·check 인덱스, `situations.interestExposure`는 `categorySignDecisionIndexes`·`productDecisionIndexes`·`interestDecisionIndexes`를 구분해 기록한다. 이들은 coverage/상황 정보이고, 목표 수가 용량을 넘었다는 것 자체는 임상적 기억 부담 측정이 아니다. 관심 동안 유지한 작업 기억이 없으면 해당 부담의 표현 기회는 `unexercised`로 보고하고 개선 증거로 삼지 않는다. 열린 목표가 있어도 실제 압력·불확실성·회상·확인 행동을 함께 살핀다. 매대를 단순히 열고 닫은 것, 상품을 실제로 focus한 것, 종류·맛·규격을 비교한 행동을 구분하며 reason만으로 비교를 인정하지 않는다. 낯섦·기억 부담·관심 노출은 상황/coverage 정보이지 명확성 보증이 아니다. 경고는 기술 오류나 임상적 판정이 아니다. 경고를 없애려고 행동을 교체하거나 고정된 실수·배회·도움 횟수를 넣지 않는다. 기술 검증 결과와 역할 검토 결과를 함께 보고한다.

candidate 7의 `personaReview.taskExpression`은 `task-expression-v1`로 표현 coverage를 기록한다. `coverage.status:"unexercised"`는 기억 부담과 이후 회복을 관찰하지 못했다는 뜻이다. 관심 동안 목표를 유지한 사실만으로 어려움이 발현됐다고 보지 않는다. 추가 soft warning은 `INTEREST_PRODUCTS_WITHOUT_FOCUS`·`UNIFORM_ORIENT_WALK_DELAYS`이며 실제 관심 상품 focus와 비교 행동, 이동 상황에 따른 지연을 검토한다. 경로 재방문은 왕복 이동일 수 있어 방황으로 단정하지 않는다.

## 구성과 시작

Node 22 이상, 설치된 `frontend/node_modules`가 필요하다. TypeScript 컴파일러와 WebSocket 라이브러리를 프런트엔드 설치에서 재사용한다. 전역 Codex 설정을 자동 변경하지 않는다.

```sh
node market-simulator/cli.cjs personas
node market-simulator/cli.cjs generate '{"mode":"stochastic","personaId":"careful-checker","seed":"sample-1","snapshotFilePath":"/tmp/mission-snapshot.json","outputPath":"/tmp/trace-1.json"}'
node market-simulator/cli.cjs validate '{"traceFilePath":"/tmp/trace-1.json","snapshotFilePath":"/tmp/mission-snapshot.json"}'
```

위 예시는 네트워크 없이 확인하는 명시적 확률 회귀 시험이다. AI 실행은 아래 LLM 설정을 사용한다. 옵션이 길면 `generate --options-file /path/options.json`을 사용한다. 결과 파일은 덮어쓰지 않는다. 생성에는 시작 전 앱 미션의 snapshot이 필요하다. snapshot은 미션·상품 버전·매장 구조·초기 재고·계산대 상태를 묶은 불변 계약이다. 같은 정책·페르소나 버전, snapshot·seed·입력 attentionExperience이면 A 모드의 trace가 같다. 새 표본에는 새 seed를 쓴다.

공용 계약은 [`marketReplayTrace.ts`](../frontend/src/game/marketReplayTrace.ts)와 [JSON Schema](../frontend/src/game/marketReplayTrace.schema.json)에 있다. Node와 앱은 같은 구조 검증기를 사용하며, Node의 `validateTrace(trace, snapshot)`은 기존 게임 어댑터를 통한 의미 검증도 수행한다. 세 프로필의 traceSchemaVersion은 `2`이며 provider/확률 policyVersion은 `5`, Codex 증분/전체 계획은 `6`이다. 앱은 저장된 v1 trace의 기존 재생을 지원한다. 임의 좌표, 이동 경로, `setPosition`, 로그 이벤트와 모르는 필드는 trace에서 거절된다. 의도의 반응시간은 이동·드래그·네트워크 대기와 별개다.

```js
require('./market-simulator/runtime.cjs').register();
const { generateTrace, generateBatch, summarizeTrace } = require('./market-simulator/src/simulator.ts');
const { validateTrace } = require('./market-simulator/src/traceValidation.ts');
const trace = await generateTrace({ mode: 'stochastic', personaId: 'careful-checker', seed: 'example', snapshot });
const validation = validateTrace(trace, snapshot);
```

`generateBatch`는 같은 snapshot을 대상으로 여러 seed의 의도 trace를 워커에서 병렬 생성한다. JSONL 각 줄은 trace만 포함한다. 앱 재생은 별도이며 실제 화면 시간만큼 걸린다. 여러 앱 탭은 서로 다른 테스트 계정으로 병렬 재생할 수 있다.

## 시험 재생 시간

새 `feedback-choice-v5`와 명시적 v2/v3/v4/v6는 `activity-duration-v2`를 기록한다. 모든 행동 전 `reactionDelayMs`는 0이고 배우는 `choiceId,durationMs,reason,memory`를 응답하며 v5/v6의 담기·내려놓기에는 `choiceParameters`도 포함한다. `moveDirection`의 durationMs는 배회·회피 모드에서도 모델이 고르는 조이스틱 입력 지속 시간 100~2000ms다. 일반 조작은 0, pause/lookAround/readList/browse는 100~120000ms, viewCart/viewHelp는 화면을 연 뒤 확인할 0~120000ms다. `reason`은 짧은 공개 행동 서술이며 목적의 정당화가 아니다. 목록 읽기 2초 같은 고정 활동 시간도 배우가 선택한 값으로 대체한다. 실제 보행·드래그·UI 전환·서버 접수 시간은 유지하며 확인 시간과 중복하지 않는다. 구형 delayMs 요청은 거절한다. 명시적 v2에는 자동 배회·회피를 추가하지 않으며 명시적 v3는 `exploration-v1`을 유지한다. 명시적 feedback v1은 `activity-duration-v1`과 `durationMs:0`의 기존 anchor 이동을 유지하고, 저장된 v1/v2/v3 및 actor-preserved-v1 trace는 원래 의미로 재생한다. [시간 계약과 예시](../market-persona-skill/references/feedback-plan.md#행동-시간)를 참고한다.

`whole-trace-v3`의 `prepare_whole_trace`는 `timingProfile` 기본값과 허용값이 `original`이며 명시적 `compact`는 거절한다. Luna가 판단마다 제출한 `delayMs`와 프로필 보행 기준을 유지하며 임의 시간 지터나 compact 압축을 적용하지 않는다. 완성 trace에는 `generation.timingProfile:"actor-preserved-v1"`·`generation.actorStateVersion:"1"`을 기록한다. 반응 지연은 실제 이동·읽기·드래그·서버 대기와 별개이며 이동은 기존 물리적 보행과 어댑터의 한 번에 32 이하 이동 입력 상한을 계속 따른다. 생성 시간 예산은 판단 시간을 일괄 단축하는 지침이 아니다.

명시적 feedback/whole-trace 정책이 없는 기존 `generate_trace`/CLI `generate`의 기본 `timingProfile`은 `compact`다. 행동 계획을 먼저 생성한 뒤 실행 시간만 조정한다. 연속 이동 전 대기는 0ms, 이동 시작 대기는 최대 350ms, 다른 행동 전 대기는 최대 1,500ms이며 이동 속도는 기본 걷기의 최소 75%다. 관찰·읽기·드래그 동작 시간, 경로, 상품 선택, 수량, 도움 요청, 실패/포기 행동은 유지한다. 시간을 맞추기 위해 과제를 조기 종료하거나 로그 시각을 바꾸지 않는다.

기존 조건 재현에는 `"timingProfile":"original"`을 명시한다. 이미 저장된 trace는 자동으로 바뀌지 않는다. 빠른 trace에는 `generation.timingProfile=compact-v1`과 원래 계획의 `sourceTraceId`를 기록하고 새 trace ID를 부여한다. 이는 시험 속도 설정이며 실제 사람의 수행 시간이나 능력 향상 지표가 아니다. 서로 다른 timing profile의 소요 시간을 학습 효과로 비교하지 않는다.

기존 compact 시험의 목표는 일반적인 재생을 약 3~5분 안에 완료하는 것이다. 짧은 과제를 3분까지 강제로 늘리지 않으며, 매우 긴 탐색이나 네트워크 대기는 5분을 넘을 수 있다. 전체 계획의 판단 지연을 이 목표에 맞춰 줄이지 않는다. `timeBudgetMs`는 기존 **행동 계획 생성**의 예산이며 실제 실행을 5분에 강제 종료하는 기능이 아니다.

## 격리 설정과 앱 연결

재생은 개발용 웹앱에서 `?marketReplay=1`과 유효한 일회성 pairing이 있을 때만 켠다. 기존 앱을 운영 계정으로 재생하지 않는다. 전용 DB와 별도 인증키를 사용하는 local/staging 백엔드, 테스트 계정을 준비하고 앱의 API 설정도 그 서버로 맞춘다. `isolated:true`는 운영자의 격리 확인이며 서버 DB를 원격 검증하는 기능은 아니다. 앱은 로그인 계정을 `/api/members/me`로 확인한다.

`MARKET_REPLAY_CONFIG`에 아래 형태의 로컬 JSON 경로를 넣고 파일 권한을 `0600`으로 설정한다. 운영 환경은 지원하지 않는다. local은 loopback, staging은 정확한 HTTPS origin만 허용한다. 브릿지는 언제나 `127.0.0.1`에만 바인딩한다. `localhost`와 `127.0.0.1`, 각 포트는 서로 다른 origin이다.

```json
{
  "port": 8765,
  "appOrigins": ["http://127.0.0.1:18082"],
  "targets": [{
    "env": "local",
    "backendOrigin": "http://127.0.0.1:18080",
    "memberIds": ["dedicated-test-member-uuid"],
    "isolated": true
  }],
  "manifestPath": "/absolute/path/to/replay-manifest.jsonl"
}
```

MCP STDIO 서버를 지속 실행한다. 브릿지는 첫 연결 도구 호출 시 시작된다. 프로세스 종료나 통신 중단 시 앱 재생도 정지하므로 명령마다 서버를 다시 시작하지 않는다.

```sh
MARKET_REPLAY_CONFIG=/absolute/path/to/target.local.json node market-simulator/server.cjs
```

| 도구 | 역할 |
| --- | --- |
| `list_personas` | 현재 페르소나·버전·파라미터 조회 |
| `pair_app_session` | allowlist의 appOrigin/backendOrigin/memberId 조합에 일회성 URL 발급 |
| `list_app_sessions` | 연결된 탭, 계정, 미션 snapshot ID, 재생 준비 상태 조회 |
| `begin_feedback_plan` | 첫 방문 세션을 만들고 현재 화면·개인·기억의 첫 frame 반환 |
| `step_feedback_plan` | 단일 선택 적용 후 결과와 다음 frame 반환, 같은 requestId의 중복 실행 방지 |
| `observe_feedback_plan` | 통신 중단 뒤 현재 frame 복구 |
| `finalize_feedback_plan` | 완성 파일과 접수·실행 수 및 시간 반환 |
| `generate_trace` | personaId/seed와 tabId 또는 snapshot 또는 snapshotFilePath로 trace 생성·파일 저장 |
| `prepare_whole_trace` | 전체 상태·행동 계약·페르소나·확인된 관련 기억을 불변 bundle로 준비 |
| `submit_whole_trace` | Luna의 전체 후보 배열을 기존 게임 로직으로 컴파일·검증·저장 |
| `repair_whole_trace` | 수정할 decisions suffix만 제출; 서버가 요청 정보를 채우고 기존 수정 1회 제한 적용 |
| `whole_trace_status` | 전체 계획 요청의 상태·실패 진단·저장 결과 조회 |
| `prepare_persona_validation` | 성향 조합·조건·seed의 검증 슬롯 준비; 기존 v2 run 호환 |
| `check_persona_validation_readiness` | 완료·대조군·짝·최대 유효 쌍·부족 슬롯 읽기 전용 점검 |
| `measure_persona_validation` | 공통 성향 지표·전체 목표 결과·관찰 기회·한 축 비교 측정 |
| `prepare_blind_review` | 공통 성향 판정 지침과 A/B 익명 표본 준비 |
| `submit_blind_review` | 다섯 성향 수준·unknown 답안 채점; legacy 인물 답안 호환 |
| `persona_validation_report` | 네 평가 축·블라인드 결과·한계의 JSON·한국어 보고서 |
| `create_whole_trace_learner` | whole-trace-v3 / gpt-6-luna / low에 묶인 새 개인 파일 생성 |
| `validate_trace` | trace 또는 traceFilePath를 특정 snapshot/tabId와 검증 |
| `play_trace` | 선택한 tabId에 완성된 trace 전체 전달 |
| `replay_status` | replayId로 진행 상태·앱 측정값 조회 |
| `stop_replay` | 선택한 탭의 입력 해제와 정지 요청 |

1. `pair_app_session`이 반환한 URL을 새 개발용 앱 탭으로 연다. pairing은 5분 안에 한 번만 쓸 수 있다. 토큰은 URL fragment로 전달되어 서버 요청에 포함되지 않으며 앱은 읽은 뒤 주소에서 제거하고 메모리에만 보관한다. pairing URL을 저장·공유하거나 로그에 복사하지 않는다.
2. 지정한 테스트 계정으로 로그인하고 장보기 미션 시작 화면으로 이동한다. `list_app_sessions`에서 `ready:true`, `visible:true`와 예상 계정·미션을 확인한다. 미션 시작 버튼은 trace의 `start`가 누른다.
3. `generate_trace({personaId,seed,tabId})`로 현재 미션에 맞게 생성한다. `validate_trace({traceFilePath,tabId})` 후 `play_trace({traceFilePath,tabId})`를 호출한다.
4. `replay_status({replayId})`에서 완료·실패와 움직임 측정값을 확인한다. AI 분석 요청 흐름은 `submitForReview → awaitReviewAccepted → leave`이며 분석 요청이 수락되기 전에 화면을 떠나지 않는다. 포기 흐름은 `giveUp → skipRating → leave`다.
5. 중단은 `stop_replay({tabId})`로 요청한다. 앱 정지 확인까지 탭 lease를 유지한다. 미션 변경·계정 변경·연결 상실·heartbeat 만료 시 계속 진행하지 않는다. 재연결에는 새 pairing이 필요하다. 각 스텝은 제한시간과 중단 신호를 따르며, 이미 기존 앱 핸들러가 보낸 HTTP 요청은 취소하지 못하지만 기다리던 재생은 즉시 정지하고 후속 입력을 실행하지 않는다.

일반 CLI로도 같은 프로세스를 유지할 수 있다:

```sh
MARKET_REPLAY_CONFIG=/absolute/path/to/target.local.json node market-simulator/cli.cjs interactive
```

표준입력 한 줄마다 `{"tool":"list_app_sessions","arguments":{}}` 같은 JSON을 넣는다. 탭당 한 replay만 허용하고 동일 테스트 계정의 다른 탭 동시 실행도 막는다. 서로 다른 계정과 탭은 병렬 실행한다. 브릿지 heartbeat는 2초, 통신 만료는 8초다.

## 실제 화면과 로그

앱 플레이어가 미션 snapshot을 다시 검증하고 정상 게임 루프의 joystick 입력으로 경로를 따라 움직인다. `movement.speedMultiplier`는 joystick 세기이며 전체 시간 배속이 아니다. 달리기는 허용하지 않는다. 상품은 실제 드래그 시작·이동·드롭 경로를 거치며 취소·영역 밖 드롭도 공용 계약으로 표현한다. 앱은 배경 탭과 숨겨진 화면 재생을 중단한다.

`replay-manifest.jsonl`은 권한 `0600`의 별도 로컬 실행 기록이다. trace ID/hash, replay ID, 탭/계정/백엔드, questInstanceId, 실제 앱 tracker sessionId, 상태와 앱 보고를 연결한다. 토큰·비밀번호·인증 헤더는 기록하지 않는다. `BehaviorLogRequest` 포맷이나 실제 사용자 분석 필터에 합성 출처 필드를 추가하지 않으므로 **전용 DB/계정 격리가 필수**다. 생성 trace의 metadata와 manifest가 합성 실행 출처이며 앱의 기록을 사후 꾸미지 않는다.

원활함은 화면 확인과 앱의 실제 측정값으로 판단한다. 생성기의 seed 재현이나 의도 스키마 통과가 실제 렌더링 FPS, 드래그 성공, 백엔드 수락을 증명하지 않는다. 앱이 보고한 이동 간격·프레임 간격·회전·teleport·드래그 결과와 실제 로그/응답을 별도로 검증한다.

## 페르소나와 LLM

[프로필 JSON](personas/)에 개인 배경 `character`, 자연어 `prompt`, 기존 시간·선호·지원 `parameters`, 주의·기억 `attention`, 선택·확인 습관 `shoppingStyle`을 보존한다. 같은 프로필이 전체 계획과 증분 정책에 사용된다. 전체 계획도 인물의 선택 지식에는 제한된 화면·발견 기억을 적용하지만 모델 자체에는 전체 세계 참고 자료가 있으므로 두 모드의 정보 노출 조건을 같다고 보고하지 않는다. 익숙한 상품 선호·시작 습관은 현재 매장의 상품 위치나 재고를 알려주는 공간 기억이 아니다.

| 프로필 | 허구의 인물과 관찰 가능한 성향 |
| --- | --- |
| `mild-intellectual-disability-adult` v5 | 지민, 32세. 구체적인 한 항목씩 처리한다. 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레는 개인 취향이며, 관심을 살핀 뒤 스스로 또는 단서에 따라 목표로 복귀한다 |
| `careful-checker` v3 | 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 안정적으로 쓰며, 낯선 배치·조작과 여러 조건에서는 시간을 갖고 실제 상품·목록·장바구니를 대조한다 |
| `quick-decider` v3 | 민수, 29세. 익숙한 초코 우유·청사과·매운 카레를 빠르게 고른다. 여러 이름·규격·수량을 함께 추적할 때 일부를 놓칠 수 있고, 확인한 불일치와 구체적인 단서로 수정한다. 관심은 짧게 살핀다 |

세 명 모두 경도 지적장애가 있는 허구의 성인이다. 인물마다 선택한 인지·적응 특성과 개인 성격·취향을 구분하고, 몇 가지 특성만 일관되게 적용한다. 세 JSON의 prompt에 두 원자료 전문과 존중 원칙을 각각 보존한다. [프로필 스키마](personas/persona.schema.json), [원자료·해시](personas/references/)와 [대응 및 한계](personas/audit.md)에 설정 출처와 행동 정책의 대응을 기록한다. 절약·빠른 결정·상품 취향은 개인 설정이며, 수치는 정책 설계값으로 사람이나 장애 집단에서 추정한 통계가 아니다.

A 모드는 각 프로필의 구조화된 설정으로 주의 상태와 제한된 발견 기억을 유지한다. `shoppingStyle`의 여섯 값은 비교 기회·최대 비교 페이지·선택 후 목록 확인·계산 전 확인·익숙한 후보의 빠른 선택·진행 방향 유지에 쓰인다. 상품에 익숙해도 현재 배치와 조작은 처음일 수 있다. 공개된 모든 상품·지도·목표를 정책이 자동으로 알고 있는 것으로 취급하지 않고, `readList`로 읽은 목표, 실제로 살핀 상품 페이지, 주변 단서와 발견 기억을 사용한다. 자연어 전체를 A가 해석하는 것은 아니다. 기본 B(AI) 모드는 구조화된 인물 설정·관찰·경험으로 실제 모델이 다음 의도를 고른다. 확률 정책의 주의/능력 수치를 전달하지 않는다.

차이는 이동 시간뿐 아니라 실제 비교 페이지, 재확인, 상품 선택과 관심 이동으로 확인한다. 가격 선호는 관찰한 대안이 있을 때 해석하고, 지정된 상품 하나만 있는 미션에서 더 싼 대체품을 고르는 것으로 과장하지 않는다. 높은 확인 성향도 완벽한 구매를 보장하지 않으며, 빠른 선택도 의무적인 오답을 뜻하지 않는다.

“이유 없는 반복 금지”는 모든 행동이 구매 목표에 직접 도움이 되어야 한다는 뜻이 아니다. 방향을 다시 찾거나, 목표 밖 관심 상품을 오래 살피거나, 같은 매대를 다시 찾고 스스로 목표로 복귀할 수 있다. 실수·이탈 quota나 좌표 흔들림으로 차이를 강제하지 않는다. `reason`은 짧은 관찰 기술이어도 되며 인물에게 자기 행동의 설명을 강요하지 않는다. `attentionTag`·`cueRefs` 같은 생성 조건은 모델 감사 정보이지 발화·측정된 심리 상태가 아니다. 발화·억양·동의 편향 등 이 게임에 없는 상호작용을 검증했다고 주장하지 않는다.

`mode:"llm"`일 때 `llm.baseUrl`, `llm.model`, API 키 환경변수 **이름** `llm.apiKeyEnv`를 설정한다. 기본 환경변수는 `MARKET_LLM_BASE_URL`, `MARKET_LLM_MODEL`, `MARKET_LLM_API_KEY`다. 기본 연결은 OpenAI 호환 `/chat/completions`이며 `llm.protocol:"ollama"`는 `/api/chat`을 사용한다. AI는 제시된 조작의 choiceId를 선택하고 코드는 그 선택을 변환한다. `feedback-choice-v4`에서는 실제 막혔던 방향을 잠시 제외하되 현재 가능한 비이동 조작을 유지한다. 명시적 v3는 기존 배회·회복 턴의 방향 이동 제한을 유지한다. 형식 오류만 최대 2회 다시 요청하며 재요청도 호출 상한에 포함한다. 기본 호출 상한은 300회, 요청 제한시간은 45초다. 이 호출 상한은 feedback의 최대 행동 수 100과 별개다. 인증키 값은 옵션·파일·로그에 넣지 않는다. 실패를 확률 정책으로 조용히 대체하지 않는다. LLM의 새로운 호출은 동일 seed 재현을 보장하지 않으며 저장된 완성 trace를 재생한다.

## 주의 정책의 회차 경험과 재생

명시적 확률 회귀 모드에서 각 인물의 `attention` 설정은 관심 단서, 관심 유지·복귀, 제한된 목표/공간 기억을 위한 설계값이다. `parameters`와 `shoppingStyle`은 각 인물의 처리·확인·선택·지원 성향을 설정하며, 실제 선택은 익숙함·부담·스트레스·지원·이미 확인한 정보에 따라 달라진다. 인물별 대응과 현재 버전은 [감사 기록](personas/audit.md)에 정리한다. 숫자를 관측 오류율이나 실제 사람의 능력으로 읽지 않는다. 선택한 특성과 개인 관심은 세션 중 유지한다.

생성 옵션 `attentionExperience`는 현재 회차의 경험 조건이다. 기본 초회는 `{"visit":"first-play"}`다. AI 반복 방문에는 `confirmedExperience`가 앱 실행과 DB 기록을 확인해 만든 경험 파일을 넘긴다:

```js
const nextTrace = await generateTrace({
  personaId: 'mild-intellectual-disability-adult', seed: 'visit-2', snapshot,
  attentionExperience: {
    visit: 'revisit',
    previousLayoutKey: confirmedExperienceArtifact.previousLayoutKey,
    memory: confirmedExperienceArtifact.memory,
    learning: confirmedExperienceArtifact.learning,
  },
});
```

확률 회귀 정책의 `layoutKey`는 생성기가 배치에서 계산한다. 이전과 같은 배치에서만 발견한 매대·앵커의 공간 기억을 재사용하고, 배치가 달라지면 공간 기억을 버리되 별도로 익힌 조작 경험은 유지한다. 매 회차의 목표는 다시 목록을 읽어 얻는다. `controlsPracticed`는 정책 action.type별 경험이며 상품 이름을 안다는 사실과 다르다.

출력 `trace.attentionExperience`에는 `{layoutKey,memory,source:"planned-trace"}`가 담긴다. 이 기억은 **계획된 trace의 경험**이며 실제 앱이 그대로 실행됐거나 사람이 학습했다는 증거가 아니다. 실행하지 않은 계획을 반복 방문의 실제 플레이 경험으로 보고하지 않는다.

trace v2의 이동은 가까운 segment 앵커를 목적지로 연결하고, `readList`는 실제 HUD 목록을 처음부터 끝까지 스크롤해 확인하며, `browse`는 선반의 공개 페이지를 살핀다. 생성 파일 옆의 `.snapshot.json`에는 동일 조건 재현에 필요한 초기 화면·게임 설정을 함께 저장한다. 완성된 trace 전체를 한 번 전달한다. 중간 앵커는 작은 RPC 이동명령으로 나누어 전송하는 방식이 아니다. 생성 단계의 주의 전환·복귀는 미리 계획되며 **실제 재생 중 상황을 새로 읽고 경로를 바꾸는 적응 분기는 없다**. 앱의 의미 검증과 정상 입력 경로는 계속 적용한다.

새 attention 생성에서 `maxActions`·`timeBudgetMs` 또는 LLM `maxCalls`를 넘으면 기술적인 생성 중단 오류로 처리한다. 이는 아래 명시적 v9·v10·전체 계획의 행동 100회 관찰 상한과 별개여서, 해당 모드에서도 너무 작은 기술 예산은 100회 전에 오류를 낼 수 있다. 오류로 끊긴 계획을 인물이 자발적으로 포기한 trace로 꾸미지 않는다. 기존 레거시 정책의 상한 처리 호환은 유지한다. 실제 `giveUp` 선택과 검토 접수 요청도 구매 성공이나 AI 분석 성공의 증거는 아니다.

## 검증

```sh
npm --prefix market-simulator run typecheck
npm --prefix market-simulator test
npm --prefix market-simulator run verify
npm --prefix market-simulator run verify:persona
npm --prefix market-simulator run verify:attention -- --count 10 --output /absolute/new-directory
npm --prefix market-simulator run verify:personalities -- --count 12 --output /absolute/new-comparison-directory
```

`verify:personalities`는 같은 미션의 세 페르소나 계획과 동일 관측 조건의 선택 검사를 비교한다. 실패 표본도 집계하며 반응 시간, 상품 비교, 목록·장바구니 확인, 관심 이동, 친숙한 상품 선택과 반품을 기록한다. 출력은 실제 앱 로그가 아닌 계획 검증 자료다.

프로필이나 정책을 편집한 뒤에는 기존 MCP/Node 프로세스를 재시작해 모듈 캐시를 갱신한다. 공유 재생 코드도 변경했다면 개발 웹 서버가 새 코드를 번들링하는지 확인하고 앱을 새로 열어 연결한다. 기존 trace는 생성 당시의 행동을 유지하므로 새 설정을 적용하려면 새 trace를 생성한다.

테스트는 공용 trace 계약·snapshot 바인딩·의미 가드·페르소나 차이와 MCP/WS 인증·탭 병렬성·연결 중단을 확인한다. 실제 웹앱 입력·프레임·드래그·백엔드 동작은 별도의 앱 통합 실행으로 확인한다. Codex 작업 흐름은 [SKILL.md](../market-persona-skill/SKILL.md)를 따른다.

### AI 행위자의 안내 전달 및 서버 연결

attention 기반 LLM 정책은 `llm.protocol: "ollama"`로 인증된 `/api/chat`을 호출할 수 있다. API 키는 `apiKeyEnv` 환경변수로만 전달하며, 원본 교환 기록에 인증 헤더는 넣지 않는다. 관찰·확인된 경험·선택지에 18,432 컨텍스트를 사용하므로 해당 크기를 지원하는 서버가 필요하다. 기본 프로토콜은 기존 OpenAI 호환 방식이다.

`ActorObservation.instructions`는 앱 시작 설명·브리핑을 첫 관찰에, 결제 안내를 결제 단계에만 전달한다. 이 필드는 해당 문장을 이해하거나 장기 학습했다는 표시가 아니다. 기존 stochastic 정책은 여전히 확률 시뮬레이터이며 문장을 이해하는 LLM으로 취급하면 안 된다. 조작/상품 기억만으로 학습했다고 판단하지 않는다. 아래 AI 경험 기록을 추가해 관찰 내용과 안내도 다음 선택에 전달한다.

### 경험 기반 AI 행위자 v1 (2026-09-30)

AI 경로는 AttentionPolicy의 확률 선택·기억 소실·감정/능력 수치를 사용하지 않는다. 고정 개인 특성(관심·강점·선호·지원 필요)을 바탕으로, 현재 관찰과 최근 6개 관찰 경험을 모델에 전달한다. 실제 실행 여부가 확인된 이전 회차 경험은 최대 24개다. 이 수는 실행 컨텍스트 예산이며 실제 사람의 기억 용량으로 보정된 값이 아니다. 전체 연구 문서를 매 행동에 반복하기보다 기존 페르소나의 구조화된 개인 특성을 전달한다.

`record-pilot-round.cjs`는 앱 완료 보고서와 DB 로그 연속성을 검증한 AI 재생에만 `experience.learning`을 만든다. 저장 내용은 실제 실행한 목록 읽기·상품 선택/제거·장바구니 열기와 해당 화면의 안내다. v9 시스템 계산 회차에서는 `firstStepId` 이전의 개인 행동 경험만 저장하고 자동 처리 구간은 제외한다. 표시 내용은 바인딩된 스냅샷에서 재구성하므로 실제로 읽고 이해했음을 뜻하지 않는다. 가상 계획의 경험은 같은 계획 생성 안에서만 쓰며 장기 경험으로 승격하지 않는다. 분석의 숨은 정답이나 성공 판정을 주입하지 않는다.

다음 `generate_trace`에는 `attentionExperience: {visit, previousLayoutKey, memory, learning}`을 전달한다. 첫 방문/확률 모드에는 learning을 허용하지 않으며, 앱 탭에 실행할 때 계정도 일치해야 한다. 배운 전략을 정답 문장으로 삽입하거나 반복마다 오류 확률을 낮추지 않는다. AI가 구체적인 경험을 참고하는 과정이며 실제 인간의 학습/망각/전이를 입증한 모델이 아니다. 별도 실제 참여자 자료로 보정하고 평가해야 한다.

사용자가 Codex 어시스턴트의 직접 플레이를 요청한 경우 이 생성기로 행동을 대신 정하지 않는다. 새 실험은 [직접 역할 수행 규약 v2](../market-persona-skill/assistant-learning-protocol.md)를 따른다. [민재 연구 참고 사례](personas/research-learning-minjae-v2.json)의 빈 기억에서 시작하고, 실제 UI 원본/sessionId/시각/해시를 연결한 `ResearchArchive`와 배우의 `ResearchMemory`, 현재 `ResearchRecall`을 분리한다. `researchEncodingContext`에는 최근 관찰과 자신의 연상만, `researchRetrievalContext`에는 자신의 연상과 현재 UI만, `researchLearnerContext`에는 선택한 회상과 현재 UI만 전달한다. 전체 원본과 분석/채점은 행동 입력에 넣지 않는다. 회상 오류를 정답으로 덮어쓰거나 자동 숙달을 만들지 않는다. CLI `scripts/prepare-research-learner.cjs`가 실제 원본 파일 해시를 확인하며, 내용의 진실성과 UI 일치는 별도로 확인한다. [출처와 구현 범위](../docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md)를 함께 읽는다. 기존 `AssistantExperience` / `assistantLearnerContext`는 v1 기록을 읽는 경로로 보존하며 새 조건에 이식하지 않는다.

실행 확인 경험에는 읽은 목록, 표시 안내, 열어 본 상품 페이지, 담기/빼기, 장바구니 확인을 담는다. 현재 계획 중 기억에도 선택한 이동/매대와 관찰한 상품을 함께 보관한다. 행동 이름만 남겨 무엇을 봤는지 잃는 문제를 줄이기 위한 변경이다. 실제 요청 검사와 미해결 탐색 반복은 [2026-09-30 검증 기록](../docs/ai/actor-learning-2026-09-30.md)을 따른다.


## 관찰 기억 보존 v2 (2026-09-30)

`episodic-choice-v2`는 최근 행동 6개와 별개로 현재 회차에서 실제 표시된 시작/결제 안내, 마지막으로 읽은 목록, 발견 장소·상품·통로, 이동한 연결과 목적지 방문 횟수를 모델에 전달한다. 위치 단서는 관찰 당시 위치 기준임을 표시하며 현재 화면 단서를 우선한다. 아직 보지 않은 지도나 목표 상품 위치를 계산해 넣지 않는다.

AI는 짧은 `currentTask`를 직접 출력할 수 있다(최대 160자). 다음 요청의 `actorChosenTask`로 이어지며 코드가 목표를 대신 선택하지 않는다. 이 문장은 가상 행위자의 임시 의도이며 실제 사람의 발화나 내면 사고를 측정한 것이 아니다. 과거 회차의 현재 작업과 목표 목록은 새 회차에 자동 복사하지 않는다.

장소·상품 기록은 컨텍스트 크기를 제한하는 버퍼다(통로 256, 장소 64, 상품 96, 최근 이동 48). 이는 임상적 기억/망각 모형이 아니다. 정보가 입력에 있다는 사실과 그것을 이해·활용하는 능력은 구분한다. 모델은 기록을 잘못 해석하거나 재확인할 수 있으며 자동 성공률 증가나 정답 행동 대체는 없다.

[보완 및 비교 시험](../docs/ai/actor-memory-v2-2026-09-30.md)


후속 `episodic-choice-v3`는 위 기억 보존에 동작 피드백을 추가한다. `lookAround`/`pause`의 선택지에는 제자리 대기이며 화면을 회전/확장하지 않는다는 설명을 붙인다. 대기 전후 관찰이 동일하면 새 장소/상품이 보이지 않았음을 결과에 기록한다. 자동 행동 교체나 반복 금지는 없다.


최종 `episodic-choice-v4`는 이동 선택지에 현재 방향·거리와 기억에 기록된 도착 횟수/현재 위치 여부를 같이 표시한다. 별도 목록의 통로 ID를 대조하지 않아도 기존 관찰 이력을 확인할 수 있다. 행동 후보를 정답 기준으로 정렬하거나 방문한 통로를 제거하지 않는다.


## 개인별 경험과 A/B/C 반복 실험 (2026-09-30)

현재 인물 버전은 지민 v5, 서연·민수 v3이며 기본 provider 정책은 `episodic-choice-v4`다. `actorPolicyVersion:"episodic-choice-v9"` 또는 v9 learner 신원을 명시한 provider 학습은 `episodic-choice-v9`, 별도로 시작한 Codex 증분 계획은 `episodic-choice-v10`, 전체 계획은 `whole-trace-v3`이다. 성격/시작 습관은 프로필에, 실험 중 확인된 경험은 별도 learner 파일에 저장한다. `learningProfile`은 관찰 영역과 상황 조건이며 매회 능력 상승이나 지정 행동을 강제하지 않는다. 아래 회차 생성 예시는 v9 learner 신원에 묶인 provider 학습 경로다. 전체 계획은 위의 새 개인·trial과 `prepare_whole_trace`/`submit_whole_trace`를 사용하고 실행·증거 기록·비교는 기존 회차 도구를 재사용한다. 기존 `whole-trace-v1`/`whole-trace-v2`의 개인·실험·저장 trace는 새 정책으로 소급 변경하지 않는다.

[학습 실험 절차](../market-persona-skill/references/learning-trials.md)에 설정 예제와 전체 MCP 순서가 있다. `create_learner`, `create_learning_trial`, `prepare_learning_round`, `generate_learning_round`, `record_learning_round`, `record_learning_failure`, `compare_learning_trial`을 추가했다. CLI는 각각 `create-learner`, `create-trial`, `prepare-round`, `generate-round`, `record-round`, `record-failure`, `compare-trial`이다.

개인 archive는 완료된 앱 replay와 DB receipt를 검사한 원본을 전부 보관한다. v2 경험은 개인/계정/페르소나 버전/실험군/모델/정책과 각 실행 session/replay/step에 묶인다. AI 입력은 실제 표시된 현재 단서와 관련성·최근성을 기준으로 최대 12개 경험을 선택하며, 성공 여부로 선별하지 않는다. 기존 v1 경험은 과거 수동 생성과 호환되지만 새 실험 저장에는 신원 결합이 필요하다. archive hash는 실수로 바뀐 파일을 찾는 용도이며 DB 서버의 전자서명이나 인간 학습의 증거는 아니다.

A는 일반 과제와 기억, B는 맞춤 과제와 기억, C는 맞춤 과제와 이전 기억 미전달을 사용한다. C도 증거는 보관한다. 기준 과제 → 사전 지정 횟수의 연습 → 공통 평가 과제 순서를 저장하고 중단 후 재개할 수 있다. B/C의 연습은 직전 세션 분석 READY와 연결된 AI 퀘스트의 실제 화면 내용이 일치해야 한다. 고정/평가 과제는 사전 등록 snapshot과 일치해야 하며 일반 과제로 대체된 오류 응답은 맞춤 표본으로 받아들이지 않는다.

현재 회차 도구는 새 앱 화면으로 이동하거나 인증된 분석 API를 대신 호출하지 않는다. Codex가 정상 앱 경로로 다음 미션을 로드하고 실제 응답 파일을 전달하면 준비·기억 전달·증거 연결·비교를 처리한다. `generate_learning_round`는 모델 호출까지 하지만 앱 재생은 `play_trace`로 명시적으로 실행한다. 모델과 앱/격리 서버 연결이 없는 환경의 자동 테스트는 계약 검증이며 수행 향상 실험이 아니다.

최근 관찰에 화면 방향/보이는 표지 설명, 실제 도움 본문, 직원 응답을 포함했다. 의미 없는 ID를 해석하는 부담을 줄였지만 이동 후보를 정답 순서로 정렬하거나 재방문을 금지하지 않는다. 이 보완만으로 LLM의 완주나 향상이 확인됐다고 주장하지 않는다.

## 행동 100회 상한과 시스템 계산

이 절의 100회 관찰과 자동 계산은 명시적으로 선택한 `episodic-choice-v9`, `episodic-choice-v10`, `whole-trace-v3`에 적용된다. 기본 `generate_trace`의 `episodic-choice-v4`는 기존 프롬프트·선택 방식·기술 실행 상한을 유지한다.

AI 정책 v9는 `character`와 함께 원자료에서 정리한 짧은 실행 원칙(`src/actorInstructions.ts`)을 보낸다. 모델이 선택하는 첫 100회에는 개인의 취향·강점·선택권, 낯선 상황에서의 배회와 관심 전환을 유지한다. 최단 경로나 정답을 주지 않고 보이는 조작 전체를 계속 선택할 수 있다. 선택 ID는 행동에 고정되고 표시 순서만 seed/판단 순번으로 정해져, 좌표 정렬의 첫 후보가 계속 같은 방향을 유도하지 않게 한다. 이 seed는 표시 순서의 재현용이며 원격 모델의 동일 출력을 보장하지 않는다.

`ActorActivityMonitor`는 모델에게 전달된 관측만 사용한다. 새 통로·상품·도움 문구·목록·상품 페이지·장바구니 상태와 처음 도착한 장소를 기록한다. 단순 시간 경과, reason/currentTask 문구 변경, 이미 본 화면의 열기/닫기는 새 발견으로 세지 않는다. 구매 정답 여부는 판단하지 않는다. 현재 결과에 새 관측 여부, 직전 장소 복귀, 도착 횟수와 같은 이동 횟수를 붙인다.

v9는 반복과 새 관측이 없던 구간을 진단 기록으로만 사용한다. 반복 횟수 때문에 재검토를 지시하거나 다른 행동으로 교체하거나 조기에 종료하지 않는다. 모델이 선택해 적용한 상위 행동을 최대 100회 관찰하며 `start`, 이동을 실행하는 세부 입력, 이후 시스템 처리 단계는 이 수에서 제외한다. 형식 오류 재요청은 모델 호출 예산을 사용하지만 적용된 행동으로 세지 않는다. 모델이 100번째 행동에서 제출·자발적 `giveUp`을 선택한 경우도 그대로 따른다. 100회는 관찰 범위이며 장애의 임상적 행동 기준이 아니다.

100회 후에도 진행 중이면 **당시 장바구니를 그대로 계산·분석 접수하는 시스템 구간**을 추가한다. 상품을 추가·제거하거나 목표에 맞게 보정하지 않으며, 빈 장바구니도 그대로 제출한다. 기존 이동 입력으로 계산대에 도착하고 필요하면 직원에게 계산대 호출을 요청한다. 계산을 거쳐 `submitForReview → awaitReviewAccepted → leave` 순서로 끝내므로 분석 요청이 수락되기 전에 나가지 않는다. 이동은 기존 충돌·보행 가드를 유지하고 순간이동을 사용하지 않는다. 시스템 구간 길이는 현재 위치·열린 화면·직원 유무에 따라 달라지므로 전체 trace 길이가 104단계로 고정되지는 않는다.

`generation.systemCompletion = {reason:"action-limit", afterDecisions:100, actionLimit:100, firstStepId, checkoutId, cartAtStart}`에 시스템 처리의 시작과 계산 대상·장바구니를 남긴다. `firstStepId`부터의 이동·직원 호출·제출은 시스템이 계획한 것으로, 페르소나가 스스로 계산대를 찾았거나 과제를 완주한 능력의 증거가 아니다. 실행·DB 증거와 실제 제출 장바구니가 `cartAtStart`와 일치하는지 검증한다. 앱 보고서에 시작 경계가 있으면 메타데이터·관측 장바구니도 대조한다.

검증된 회차는 `outcome:'assisted-completion'`, `learningEligible:true`, `learningScope:'actor-prefix'`, `analysisEligible:true`, `performanceEligible:false`로 측정한다. 개인 기억의 controls/episodes에는 `firstStepId` 이전만 반영하므로 자동 계산 경로·안내·직원 호출·제출은 다음 회차 경험에 들어가지 않는다. 실제 제출된 구매 내용은 기존 방식으로 측정하되, 실험 회차는 `status:'assisted-submission'`, `metrics:null`로 기록해 독립 완수의 기준/평가 비교에서 제외한다. 이 회차도 다음 분석과 퀘스트 연결은 이어갈 수 있다. 단, `analysisEligible`은 분석 완료 증거가 아니며 실제 서버의 `READY`와 연결된 AI 퀘스트는 별도로 확인해야 한다.

기존 v6/v7의 반복 정체 종료와 v8의 `giveUp → skipRating → leave` 상한 종료는 `generation.controlledStop`으로 계속 구분한다. v9의 시스템 계산 메타데이터와 섞거나 지워서 자발적 수행으로 바꾸지 않는다. 기술 오류로 생성이 중단된 자료도 시스템 계산을 완료한 trace로 보고하지 않는다.

LLM 오류, 너무 작은 `maxActions`/`maxCalls`, 예정 시간 상한 등은 여전히 기술적 생성 실패다. 100회 상한은 완성 trace를 보장하거나 구매·분석 성공을 보장하는 장치가 아니다. 이 v9 종료 처리로 기존 `mode:"stochastic"` 회귀 정책의 선택과 종료 방식을 바꾸지는 않았다. 생성·검증만 요청받으면 저장된 snapshot으로 trace를 만들고 검증까지만 수행하며, 앱 재생·백엔드 전송·분석 요청은 실행하지 않는다.

MCP/CLI 생성은 모델 호출 전에 `<trace 경로>.generation/`에 snapshot과 인증정보 없는 설정을 보존한다. 관찰·선택·결과 체크포인트와 최종 상태를 기록하므로 실패한 경우도 조사할 수 있다. 미완성 자료는 완성 trace나 실제 수행 경험으로 승격하지 않는다. 진단 자료에도 실험용 미션 내용이 있으므로 공유할 때 검토한다. 키·인증 헤더·원본 모델 교환/추론은 저장하지 않는다.

정책 변경 전후를 동일 학습 실험으로 섞지 않는다. 기존 프로세스를 재시작하고 새 개인/실험을 만든 뒤 동일 정책에서 비교한다. v9 trace는 새 스키마를 지원하는 앱 번들로 재생해야 한다. 기존 v6/v7의 `persistent-stagnation` 및 v8의 `action-limit` 종료 trace는 계속 검증할 수 있으며, 저장된 과거 trace를 v9 정책으로 소급 변경하지 않는다.
