---
name: market-persona
description: Generate Oneuldo persona action traces with a whole-trace Luna plan or incremental AI decisions, replay them in an isolated development app, and compare personalized quests using confirmed individual memory.
---

# Oneuldo 페르소나 의도 생성과 앱 재생

## 현재 기본: feedback-choice-v7

새 `begin_feedback_plan`의 기본은 `feedback-choice-v7`이며 HTTP 생성은 이를 명시한다. 일반 `generate_trace`의 기존 episodic 기본값은 유지한다. 명시적 v1~v6와 과거 저장 자료는 기존 계약으로 재현한다. 아래 v5/v6의 기본 채택 기록은 과거 상태를 설명하며 새 생성에는 이 v7 절을 우선 적용한다.

v7은 v6의 개인 동기·선택권을 유지하며 다음 표현을 분리한다.

- `experience.checks.cartChangedSinceLastCartView`: 실제 장바구니 확인 이후 관측·적용 결과로 확인한 변화. 닫기·목록 읽기는 기준을 초기화하지 않는다. 변화 없음은 false, 변화 있음은 true, 불확실하거나 24행동 기한이 지난 경우는 null이다.
- `rememberedItems.quantity`: 배우가 현재 원한다고 믿는 총수량. 선택적 `rememberedCartQuantity`는 마지막으로 담겨 있었다고 기억하는 수량이며 `source`는 list/personal/uncertain 중 배우가 믿는 출처다. 틀린 값·누락·불확실성을 허용하고 코드가 채우거나 정답과 대조하지 않는다.
- 담기·빼기의 `choiceParameters.quantity`는 추가·제거할 개수다. 기억의 총수량과 구분하며 실제 현재 카탈로그의 상품·수량만 선택한다. 행동 설명이 매개변수를 덮어쓰지 않는다.
- 확인은 이미 선택한 `ongoingIntent`와 구분하고, 실행 전 응답 기억을 실행 완료 사실로 취급하지 않는다. 다음 실제 결과를 보고 배우가 수정 여부를 결정한다.

상품 기억 12개·메모 8개, 최근 행동 6개·장소 6곳·24행동 기한, 원본 페르소나와 배회 신호 0.2는 유지한다. 반복 금지·자동 수량 조정·목표 복원·강제 구매나 종료는 추가하지 않는다. trace에는 feedback version 3, experienceContract `bounded-observed-experience-v2`, beliefContract `quantity-source-beliefs-v1`을 기록한다. 제품의 최대 100행동은 유지하고 사용자가 요청한 300행동은 별도 동결 실험 사본에서만 실행한다. 실제 모델 성능은 별도로 측정하며 구현 검증만으로 성공률 향상을 주장하지 않는다.

`feedback-choice-v8`은 명시적 실험 옵션이다. v7에 진열대 상품의 `inCart` 단서와 제어자가 기록한 `lastAction`을 더하고 기억의 `currentTask`를 `nextStep`(지금 고른 행동 다음에 할 일)으로 바꾼다. 기본은 v7이며 효과는 아직 측정하지 않았다. 세부는 [v8 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v8)을 따른다. `feedback-choice-v9`는 v8에 `revisitNotes`를 더한 실험 옵션으로, 최근 24행동 안에 두 번 이상 연 진열대와 거기서 본 상품을 문장으로 전달한다. 목록·정답과 대조하지 않으며 효과는 측정하지 않았다. v9는 선택지에 포기(`giveUp`)가 없고, 100회 후에도 진행 중이면 그때의 장바구니 그대로 시스템이 계산해 `generation.systemCompletion`으로 기록한다. [v9 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v9) 참조. `feedback-choice-v10`은 v9에 더해, 최근 24행동 안에 연 진열대를 다시 여는 선택지의 라벨에 연 횟수를 표시하는 실험 옵션이다. 선택지를 숨기거나 금지하지 않으며 효과는 측정하지 않았다. [v10 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v10) 참조. `feedback-choice-v11`은 v10에 `movementNotes`를 더한 실험 옵션으로, 최근 24행동 안에 배우가 걸은 방향별 횟수와 걷지 않은 방향을 문장으로 전달한다. 지도·위치·권장 방향은 주지 않으며 효과는 측정하지 않았다. [v11 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v11) 참조. `feedback-choice-v12`는 v11에 더해, 최근에 걸어서 도착한 통로로 가는 선택지에 방문 횟수를 표시하고, 배우에게 주는 frame에서 통로 ID를 없애며, 선택지 ID를 그 frame에서만 유효한 짧은 이름(`c01`…)으로 바꾸는 실험 옵션이다. 효과는 측정하지 않았다. [v12 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v12) 참조. `feedback-choice-v13`은 v12에 더해, 목록 읽기 선택지에 최근에 읽은 시점·횟수를 표시하고 `progressNotes`로 배우 자신의 물건 기억, 계산대에서 구매를 확정해야 끝난다는 종료 조건, 계산대를 마지막으로 본 때를 문장으로 전달하는 실험 옵션이다. 종료 조건 안내는 매 판단에 반복하는 생성기의 지원이므로 계산 도달을 자발적 목표 유지로 해석하지 않는다. 효과는 측정하지 않았다. [v13 계약](references/feedback-plan.md#명시적-실험-옵션-feedback-choice-v13) 참조.

**정책 채택 상태:** feedback 기본·권장 정책은 `feedback-choice-v5`다. 현재 UI 정보 표현의 정확성과 기존 합법 행동 집합 보존 검증을 근거로 채택했으며, 성공률·인간 행동 충실도 개선을 입증한 결정은 아니다. `feedback-choice-v6`는 명시적 실험 옵션으로 유지한다. **모델 비교 결과 상태:** 2026-10-12 동일 S01에서 v5·v6 각 5회, 최대 300행동 비교를 완료했다. 두 조건 모두 관측된 목표 상품 노출·담기·완수는 0회였다. v6 1회는 1행동 뒤 선택 ID 오류로 중단돼 이후가 미관측이다. 성공률 개선은 확인되지 않았으며, 같은 궤적의 100·200·300 누적 구간과 실제 사람의 행동 타당성을 구분한다.

새 일반 페르소나 생성의 기본 경로는 **`feedback-choice-v5`**이다. 먼저 [행동 결과 기반 생성 절차](references/feedback-plan.md)를 읽는다. 현재 화면과 배우가 남긴 믿음 기억에 최근 6개 적용 행동·결과, 최근 관찰한 매대·통로의 제한된 경험을 함께 전달한다. `memory.ongoingIntent`는 당장 하는 `currentTask`와 분리해 잠깐 확인한 뒤에도 진행 중인 목적을 이어갈 수 있게 한다. v4~v6의 `exploration-v2`는 기본 20%의 seed 기반 배회 신호와 실제 막힘 회피를 유지하되, 배회·회복 턴에도 매대 열기·확인·중단 등 현재 가능한 비이동 선택지를 모두 유지한다. 이동 여부·방향·입력 시간은 모델이 선택하며 구매 목적이나 보이는 대상은 필요 없다. 전체 지도·좌표·숨은 목표·영구 목록·정확한 목표 원장은 배우에게 주지 않는다. 생성 → 완성 trace 검토/대기 → 명시적 웹 재생 순서를 유지한다. 기존 feedback v1/v2/v3/v4·whole-trace/v10은 재현·비교 또는 명시적 요청에 사용하며 저장된 행동·시간·관측 의미를 바꾸지 않는다. 아래 전체 계획 절차와 기존 연결 4단계는 이들 과거 정책을 선택했을 때 적용한다.

새 경로는 `begin_feedback_plan` → `step_feedback_plan` 반복 → `finalize_feedback_plan`이다. begin의 기본은 v5이고 `actorPolicyVersion:"feedback-choice-v1"`, `"feedback-choice-v2"`, `"feedback-choice-v3"` 또는 `"feedback-choice-v4"`로 과거 계약을 명시할 수 있다. 첫 관측과 다음 관측이 각각 begin/step 응답에 포함된다. HTTP 연결이 있으면 `generate_trace`에 `actorPolicyVersion:"feedback-choice-v5"`를 지정한다. 두 도구의 `feedbackMovement:{wanderProbability:0.2}`로 배회 신호의 확률을 0~1 사이에서 설정한다. 일반 `generate_trace`에서 정책을 생략한 기존 `episodic-choice-v4` 기본값은 유지한다. 매 판단에 새 모델 문맥으로 최근 경험과 `movementPolicy`를 포함한 현재 frame 전체를 전달한다. 이전 관측이 쌓인 배우 채팅을 그대로 쓰지 않는다. 서버는 외부 배우 문맥의 격리를 강제하거나 입증하지 않는다. feedback은 첫 방문용이며 기존 learner 기억을 자동 이식하지 않는다.

새 feedback 경로는 `choiceId,durationMs,reason,memory`와 담기·내려놓기의 `choiceParameters`를 받으며 모든 행동 전 대기는 0이다. v2~v6의 `moveDirection`은 선택한 방향으로 100~2000ms 동안 기존 조이스틱 입력을 적용하고, 벽·경계에 막힌 결과도 다음 관측에 전달한다. v4~v6의 최근 매대·통로 경험은 각각 최대 6곳·24개 행동 이내이며 매대별 상품·페이지 요약은 실제 관찰한 상품 12개·페이지 12개로 제한한다. 최근 확인과 이후 정보 변화, 보이는 장바구니와 믿음의 차이를 배우가 판단에 활용하도록 하되 기억·목표·구매 정답을 자동 보정하지 않는다. `ongoingIntent`는 생략하면 유지, 문자열이면 교체, null이면 해제하고 다른 기억 필드는 매 응답으로 교체한다. 새 trace는 `activity-duration-v2`와 `movementContract:"joystick-direction-v1"`을 유지하며 feedback version 2에 `memory:"actor-authored-with-recent-experience"`, `experienceContract:"bounded-observed-experience-v1"`, `intentContract:"persistent-intent-v1"`을 기록한다. 이동 정책의 설정·신호·제한 출처도 기록한다. 명시적 v3는 방향 이동만 허용하는 `exploration-v1` 배회·회복 턴과 기존 기억 계약을 보존한다. 명시적 v2에는 확률 배회·자동 회피를 소급 적용하지 않으며 v1은 기존 anchor 이동과 `activity-duration-v1`을 보존한다. feedback의 기본·최대 행동 한도 100과 자동 계산 없음은 유지한다. 세부 규칙은 [행동 결과 기반 생성 절차](references/feedback-plan.md)를 따른다.

Node 생성기는 행동 의도 trace를 만든다. 앱이 trace 전체를 받아 기존 이동·버튼·드래그 입력으로 실시간 플레이하고 기존 tracker·queue가 로그를 기록·전송한다. 생성기에서 게임 로그를 만들거나 백엔드에 직접 올리지 않는다. 화면 실행 없이 생성한 trace는 실제 플레이 완료 결과가 아니다.

기본 v5와 명시적 실험 옵션 v6는 [v5 기본과 v6 실험 계약](references/feedback-plan.md#v5-기본과-v6-실험-계약)을 따른다. v6는 `actorPolicyVersion:"feedback-choice-v6"`를 명시할 때만 선택한다. v5는 담기·내려놓기 선택을 상품별 허용 범위가 있는 `parameterSchema`·`catalog`로 묶고, 같은 응답의 `choiceParameters`로 선택한다. add에는 `productId,quantity,dragOutcome`, remove에는 `productId,quantity`가 필수이며 다른 선택에는 매개변수를 생략한다. `miss`·`cancel`은 수량 1만 가능하다. 상품·수량·종료를 제어자가 대신 선택하거나 reason과의 불일치를 조용히 수정하지 않는다. 현재 열린 장바구니·계산 화면의 상품명·수량은 `cartItems`로, 실제 `구매 확정` 문구와 결과·복귀 효과는 해당 선택지로 전달한다. 이는 패널 전체 관측의 표현 보완이며 스크롤 밖 행·가림을 정밀 재현한 픽셀 관측은 아니다.

v6는 v5의 관측·선택지를 그대로 두고 기존 개인의 동기·강점과 현재 선택한 구체적 활동을 표현하는 지시문만 조정한다. v5/v6 모두 원본 페르소나, 기존 기억 필드·용량·교체 및 만료 규칙, 배회·회피와 행동 시간을 유지한다. 새로운 인지지원·정답 주입·목표 복원·완수 강제·제출 차단을 추가하지 않는다. 명시적 v4와 저장된 기존 자료는 그대로 보존하며, **제품 경로의 feedback 기본·최대 100행동은 유지한다. 300행동은 별도 승인된 동결 실험에서만 사용한다.** 비교는 관찰 기회, 기술 실패, 선택과 실제 결과를 구분하고 좋은 결과만 골라 채택 근거로 쓰지 않는다. 문서의 예제나 단위 테스트는 실제 모델 효과를 입증하지 않는다.

- **확률 회귀 모드 — `stochastic`:** 세 프로필 모두 attention 설정으로 제한된 관찰·기억·주의 전환을 계획하고, shoppingStyle로 상품 비교·목록 확인·익숙한 선택·이동 방향 유지 성향을 적용한다. LLM이 매 행동을 결정한 것으로 설명하지 않는다.
- **Luna 전체 계획 모드 — `whole-trace`:** Luna는 전체 세계를 참고해 종료까지의 행동 배열을 한 번 작성한다. 같은 프로필 JSON의 개인 지침을 유지하고 매 행동의 `actorState`, 알려진 단서와 사용한 목표 기억을 선언한다. 새 기본 bundle 8 / candidate 7은 관찰 원장·작업 기억·계속 수행 중인 목표를 구분하며, 관심이나 탐색으로 focus가 바뀌어도 열린 목표의 기억을 유지한다. Node가 제출 후 화면 전개·기억 변화·행동 근거를 검증하며 그 상태를 Luna의 다음 판단에 실시간 주입하지 않는다. 관심·배회·재방문과 선택권을 유지하며 행동마다 모델을 호출하지 않는다. 이 모드에서는 [전체 계획 절차](references/whole-trace.md)를 읽는다. 같은 모델 문맥에 전체 세계가 있으므로 감사 통과가 숨은 정보의 영향 차단을 입증하지는 않는다.
- **기존 AI 모드 — `llm`와 명시적 직접 증분 계획:** 정책 옵션·learner 신원 없이 호출하는 `generate_trace`는 기존 `episodic-choice-v4` 프롬프트·선택 ID·순서·기술 상한을 유지한다. `actorPolicyVersion:"episodic-choice-v9"` 또는 v9 신원의 `learnerFile`을 제공하면 새 provider 정책을 선택한다. `begin_actor_plan`은 별도의 `episodic-choice-v10` 직접 증분 계획이다. 현재 관찰과 관련 경험을 실제 모델에 전달해 다음 행동을 결정한다. 원격 provider에는 모델 연결이 필요하고 Codex 직접 계획에는 외부 API 키가 필요 없다. 원자료 전문은 프로필에 보존하지만 매 요청에 전체 원문을 보내지는 않는다. 두 AI 경로 모두 실패를 확률 모드로 대체하지 않는다. 아래 실험의 A/B/C는 생성 모드와 별개다.

Luna 계획을 실행하는 Codex 세션은 실제로 `gpt-6-luna`/`low`로 설정한다. MCP가 모델을 전환하거나 Luna 세션을 자동 생성하지 않는다. 다른 모델은 사용자가 이양을 허용한 기존 Luna 세션에 전체 계획 작성을 맡긴다. trace의 모델 라벨만으로 실제 모델·API 호출 횟수를 입증하지 않는다.

전체 계획 작성은 **한 인물·한 조건·한 seed·한 request/bundle마다 새 actor 문맥**에서 수행한다. 저부하와 고부하, 다른 인물 또는 다른 요청의 bundle을 같은 작성 문맥에 함께 주지 않는다. 준비 결과의 `requestId`·`bundle.inputHash`를 해당 후보와 함께 기록하고 `bundle.authoringGuide`의 식별 정보·문법·상태 전이 예제를 확인한다. 호스트 MCP는 여러 요청을 관리할 수 있지만 서버가 actor 문맥의 분리를 강제하거나 입증하지는 않는다. 이는 기술적 일관성을 위한 작성 절차이며 페르소나 충실도의 개선을 보장하지 않는다.

페르소나 충실도 검증은 수동 MCP 도구 5개로 실행한다. 기본 공통 성향 모드는 숙고·확인·탐색·지속·도움 요청의 다섯 축과 성격 유형으로 1~32개 프로필을 구성하고, 수행 기준·취향·경험이 같으며 한 성향만 다른 쌍을 비교한다. 기술 유효성·과업 결과·성향 표현·관찰 기회를 분리하고 A/B 블라인드에서는 인물 이름 대신 성향 수준을 추정한다. 기존 네 인물 요청과 과거 manifest는 legacy 의미를 유지한다. 일반 생성 경로에서 자동 실행하지 않는다. 입력·출력과 독립 배우 세션 절차는 [검증 절차](references/persona-validation.md)를 따른다.

## 페르소나 선택

`list_personas`로 현재 버전과 설정을 확인한다.

프로필·정책 수정 후 기존 MCP/Node가 이전 버전을 반환하면 프로세스를 재시작한다. 공유 앱 코드도 바뀌었다면 새 번들을 로드하고 다시 연결한다. 저장된 trace는 자동 변경되지 않으므로 새 설정으로 새 trace를 생성한다.

| ID | 특성 |
| --- | --- |
| `mild-intellectual-disability-adult` | v5. 지민, 32세. 구체적인 한 항목씩 처리하며 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레를 좋아하고 스스로 목표로 복귀할 수도 있다 |
| `careful-checker` | v3. 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 강점이며 낯선 배치·조작과 여러 조건을 처리할 때 시간을 갖고, 비교·목록·장바구니 확인을 지원 전략으로 쓴다 |
| `quick-decider` | v3. 민수, 29세. 익숙한 상품에서는 빠르게 결정한다. 이름·규격·수량을 함께 기억해야 할 때 일부 조건을 놓칠 수 있고, 실제 불일치와 명확한 단서를 확인하면 선택을 수정한다. 좋아하는 상품은 짧게 살핀다 |

실행 정의의 단일 원본은 [지민](../market-simulator/personas/mild-intellectual-disability-adult.json), [서연](../market-simulator/personas/careful-checker.json), [민수](../market-simulator/personas/quick-decider.json)의 구조화된 JSON이다. 전체 계획과 증분 계획은 같은 JSON에서 개인 특성을 읽고 모드별로 성격을 다시 정의하지 않는다. 세 명 모두 **경도 지적장애가 있는 허구의 성인**이며 선택한 인지·적응 특성과 개인 성격이 서로 다르다. 각자의 강점·취향·경험·선택권을 유지하고 모든 어려움을 한 인물에게 합치지 않는다. 절약·빠른 결정·카레 선호 자체를 장애 특성으로 설명하지 않는다. 확률 수치는 합성 정책의 설계값이며 사람이나 장애 집단에서 추정한 통계가 아니다. AI 모드는 character를 전달하며 practicedStrategies는 시작 시점의 습관이다. learningProfile은 관찰할 연습 영역과 전이 조건이며 행동 의무나 숙달 점수가 아니다. 확률 모드가 자연어의 모든 문장을 해석한다고 설명하지 않는다.

세 프로필의 근거를 확인하거나 수정할 때는 [사용자 역할 요청](../market-simulator/personas/references/persona-role-request.ko.md), [행동 이해 자료 전문](../market-simulator/personas/references/intellectual-disability-behavior-analysis.ko.md), [대응과 한계](../market-simulator/personas/audit.md)를 읽는다. [지민 v5](../market-simulator/personas/persona-mild-intellectual-disability-adult-v5.md), [서연 v3](../market-simulator/personas/persona-careful-checker-v3.md), [민수 v3](../market-simulator/personas/persona-quick-decider-v3.md) 사본은 각각 JSON prompt와 같다. 세 prompt에 두 원자료 전문을 보존하되, 자료 전체의 특성을 매번 모두 연기하지 않는다. 원문을 전달하거나 게임 행동 차이를 확인한 사실을 임상적 타당성 검증으로 설명하지 않는다.

전체 계획의 `bundle.persona.behavior`는 같은 JSON에서 상세 개인 지침, 목표 기억 용량, 반응/보행 기준과 상황별 인지 설정을 가져온다. 관심 전환, 유사 상품 구분, 수량 추적에 연결하는 설정은 합성 부담의 설계값이며 강제 오답 확률이나 임상 척도가 아니다. 새 성격을 정의하거나 원자료의 모든 어려움을 추가하지 않는다. candidate 7은 매 결정에 nullable `basis.goalId`와 배열 `basis.memoryUses`를 적고, 선택적 `actorState.taskUpdate`로 목표의 선택·완료·포기를 선언한다. `focusedGoalId:null`이나 관심·탐색 전환만으로 열린 목표를 `heldGoalIds`에서 지울 수 없다. `actorState.memoryUpdate`는 믿는 값·불확실성의 선언이며 목표 종료를 대신하지 않는다. 수락된 명시적 완료는 `taskMemory.completedGoalIds`에 ID만 기록한다. 표시된 모든 목표를 완료한 뒤 목록을 다시 확인해도 목표 재선택을 강제하지 않으며, 이 이력으로 이름·수량 기억이나 구매 정답을 복원하지 않는다. 작업 기억과 과제 상태 snapshot은 코드가 계산한다. 관찰 원장에 정확한 목표가 남아 있거나 컴파일러가 objective proof를 연결했다는 이유로 잊힌 세부를 정확하게 복원하지 않는다. focus와 기억·과제 계약, 표시된 목록·장바구니의 범위는 [전체 계획 절차](references/whole-trace.md)를 따른다. 이 상태와 근거는 허구의 공개 행동 요약이며 실제 내면 사고·발화·심리 측정이 아니다.

## 연결과 생성

1. [실행 안내](../market-simulator/README.md)에 따라 전용 DB·인증키·테스트 계정과 개발용 웹앱을 준비한다. `MARKET_REPLAY_CONFIG`의 private 파일에 정확한 app/backend origin, 계정 allowlist, `isolated:true`를 설정한다. 운영 대상은 지원하지 않는다. 이 설정은 격리의 원격 증명이 아니므로 이미 실제 분리를 확인한 환경을 사용한다.
2. 지속 실행되는 MCP에서 `pair_app_session({appOrigin,backendOrigin,memberId})`을 호출한다. 반환 URL을 새 개발용 앱 탭으로 열고 지정 계정으로 로그인한다. URL의 일회성 토큰은 저장·공유·보고서 기록하지 않는다. 앱은 fragment를 메모리로 읽고 주소에서 제거한다.
3. 장보기 미션 시작 화면에서 `list_app_sessions`로 계정·백엔드·`ready:true`·`visible:true`와 snapshot ID를 확인한다. 사용자가 시작 버튼을 미리 누르지 않도록 한다. trace의 `start`가 기존 버튼을 누른다.
4. Luna 전체 계획은 `prepare_whole_trace({personaId,seed,tabId})` → 해당 bundle만 받은 새 actor 문맥에서 전체 행동 계획 작성 → `submit_whole_trace({requestId,candidate})`로 저장한다. 새 기본 형식은 bundle 8 / candidate 7이며 행동은 현재 화면·위치에 묶인 `choiceRef`로 선택한다. 매 결정의 `basis.goalId`·`memoryUses`와 필요한 `actorState.taskUpdate`·`memoryUpdate`는 [전체 계획 절차](references/whole-trace.md)의 계약을 따른다. `taskUpdate`는 한 건이어도 배열이다. `basis.intent`와 `actorState.activity`는 서로 다른 허용값을 사용한다. 직전 행동 결과와 같은 결정의 taskUpdate를 반영한 행동 직전 상태를 작성한다. 기존 candidate 6/5/4/3은 각자의 형식과 검증 의미를 유지한다. 기존 증분 provider 생성은 `generate_trace({personaId,seed,tabId})`를 사용한다. 오프라인 생성에는 실제 시작 전 snapshot 또는 snapshotFilePath를 대신 사용한다. 원격 LLM 모드 키는 `llm.apiKeyEnv`에 환경변수 이름으로만 전달한다.
5. `validate_trace({traceFilePath,tabId})`가 성공한 뒤 `play_trace({traceFilePath,tabId})`로 전체 trace를 전달한다. 미션이 달라졌으면 새 snapshot으로 다시 생성한다. 좌표·로그·대상 ID를 사후 변조하지 않는다. 생성·검증만 요청받으면 저장된 snapshot으로 생성하고 검증까지만 수행하며, 앱 재생·DB 전송·분석 요청은 실행하지 않는다.

전체 계획의 기술 수정은 `maxRepairs:1`일 때 `repair_whole_trace`로 실패한 뒤쪽 결정만 다시 제출한다. 권장 입력은 `{requestId,repair:{decisions:[...]}}`이며 `repairFilePath`에도 같은 decisions 객체를 쓴다. 서버가 요청 ID·버전·수정 시작 위치를 채우므로 모델이 wrapper를 다시 작성하지 않는다. 기존 wrapper를 명시한 경우에는 각 값의 일치를 계속 검사한다. 이 변경은 추가 모델 호출이나 행동별 통신을 만들지 않는다. 서버는 이미 수락한 정확한 앞부분을 유지하고 같은 candidate 형식과 원래 종료 의도를 요구한다. `maxRepairs:0`이면 수정할 수 없다. 오류의 `repairContext`에는 최신 관측·현재 선택지·알려진 단서가 있으므로 이를 기준으로 스키마·선택 참조만 고친다. 미관찰 근거 오류를 자발적 포기로 바꾸거나 구매 결과를 최적화하지 않는다. 세부 요청 형식은 [전체 계획 절차](references/whole-trace.md)를 따른다.

계산대 이용은 `checkout/<계산대 ID>`(예: `checkout/checkout`), 열린 계산대에서 직원이 있을 때 제출은 `control/submit`을 쓴다. 새 `choiceCatalog.referenceAliases`에 명시된 `checkout-open-v1` 별칭만 `open/<ID>`를 같은 계산대의 `checkout/<ID>`로 연결한다. 현재 source가 정확히 일치하고 해당 정식 버튼이 사용 가능해야 하며, 별칭 없는 저장 bundle의 엄격한 해석은 유지한다. 원본 후보와 감사의 작성/실행 참조·정규화 내역을 보존한다. 이 로컬 참조 해석은 행동·경로·수량·종료를 대신 선택하거나 추가 AI 왕복을 만들지 않는다. 상세 범위는 [계산대 참조 별칭](references/whole-trace.md#계산대-참조-별칭)을 따른다.

새 `authoringGuide` v2는 candidate 최상위 필드를 `candidateVersion`, `requestId`, `decisions` 세 개로 명시한다. `inputHash`는 별도 출처 기록으로 보존한다. 실제 관찰한 상품과 수행 중인 목표에 대한 focus 예시를 따르되, 실제 오선택·관심 전환·정당한 null focus를 교정하지 않는다. 닫기·대기·긴 지연만으로 확인이나 숙고를 표현하지 않고, 비교·재확인이 필요한 상황에서 실제 정보를 보는 선택으로 성향을 드러낸다. 확인 횟수나 성공을 강제하지 않는다. v2 결과의 `personaReview.annotationReview`는 활동·focus 주석의 근거와 개선 권고를 별도로 제공한다. 이 상태는 기존 역할 검토 상태와 독립적이며, 과거 가이드 결과에서 항목이 없으면 검사 통과로 해석하지 않는다.

### 기존 Codex 증분 계획

학교 서버 모델을 행동마다 부르는 대신 현재 Codex 세션 모델이 actor가 되어야 할 때 `begin_actor_plan({personaId,seed,tabId})`을 호출한다. 응답의 `sessionId`로 `observe_actor_plan`을 읽고, 현재 관측과 페르소나, 실제 관찰 기억, `availableChoices`만 사용해 `append_actor_plan({sessionId,revision,choiceIds,delayMs,reasons})`을 제출한다. provenance는 `gpt-6-luna`, reasoning `low`, 정책 `episodic-choice-v10`/trace policy `6`이다. API 키를 설정하지 않는다.

묶음은 1~3개이며 3개를 채울 필요가 없다. 각 항목은 현재 choice ID, 자체 지연, 짧은 행동 이유를 갖는다. 실행기는 동일한 attention loop와 TraceGuard를 사용하고 각 행동 직전 choice 목록을 다시 계산한다. 관측이나 선택 집합이 달라지면 잔여 계획은 폐기되고 새 revision이 발행된다. 단계가 바뀌거나 화면·장바구니·목록·상품·단서가 바뀐 경우 이전 ID를 재사용하지 말고 새 관측을 읽는다. 잘못된 revision/ID, 중복 제출, 빈 계획, 네 개 이상인 묶음은 거절된다.

계획은 오프라인 trace만 구성한다. 마지막에 `finalize_actor_plan`으로 저장 결과를 받은 다음 일반 `validate_trace`를 통과시켜 전체 trace를 한 번에 `play_trace`한다. 계획 중 앱 입력 RPC를 보내지 않는다. 현재 MCP가 없다면 `node market-simulator/cli.cjs interactive`를 켜고 같은 네 도구를 한 줄 JSON 프로토콜로 호출한다.

## 재생과 검증

`replay_status({replayId})`로 실제 앱의 진행·완료·실패·측정값을 확인한다. AI 분석 흐름은 요청 수락을 기다린 후 나가기까지 수행한다. 중단은 `stop_replay({tabId})`로 요청하며 앱 확인까지 lease가 유지된다. 연결 상실·heartbeat 만료·화면 숨김·미션/계정 변경 시 중단을 해결하고 새 pairing으로 시작한다. 다른 계정의 앱 탭은 병렬 실행할 수 있다. 같은 계정·탭 중복 실행은 허용하지 않는다.

이동은 실제 앱의 joystick과 게임 루프를 사용하고 상품은 기존 드래그 경로를 거친다. 순간이동이나 trace를 작은 이동명령으로 나눠 RPC 전송하는 방식은 사용하지 않는다. 증분 계획은 관찰하지 않은 정답을 주입하지 않는다. 전체 계획에서도 세계 참고 자료의 미발견 상품·장소를 인물의 지식으로 사용하지 않는다. Node의 화면·발견 기억 감사와 기존 이동·재고 가드는 선언된 행동 근거를 검사하며 모델 내부의 판단까지 증명하지는 못한다. 화면 움직임·드래그와 실제 앱 측정값을 확인한다. `whole-trace-v3`는 `timingProfile` 기본값/허용값이 `original`이며 Luna의 행동 전 지연과 개인 보행 기준을 보존한다. 명시적 `compact`는 거절하고 결과에 `actor-preserved-v1`을 기록한다. 다른 경로의 compact 재생 일정은 시험 시간을 줄이는 설정이며 사람의 반응 속도·능력 향상 지표가 아니다. trace 스키마 통과나 생성기의 실행 가능성 검사만으로 부드러운 화면 재생·백엔드 수락이 검증됐다고 보고하지 않는다.

`replay-manifest.jsonl`로 trace/hash·replay·탭·테스트 계정·questInstanceId·실제 tracker sessionId를 연결한다. 기존 `BehaviorLogRequest`에 합성 태그를 추가하지 않으므로 전용 DB/계정 격리를 유지한다. 보고에는 실행 모드, 페르소나/정책 버전, seed, trace 파일과 replay ID, 실제 완료 상태 및 확인한 앱 지표를 남긴다. 인증정보나 pairing URL은 제외한다.

## 주의·경험과 계획의 범위

사용자가 어시스턴트의 직접 역할 수행을 요청한 경우 [연구 참고 학습 규약 v2](assistant-learning-protocol.md)를 적용한다. 기본 직접 배우는 [민재 v2](../market-simulator/personas/research-learning-minjae-v2.json)이고, [학술/공식 근거와 한계](../docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md)를 확인한다. 전체 관찰 원본은 감사 기록으로 두고, 배우가 남긴 짧은 연상과 현재 회상을 분리한다. `researchEncodingContext` → `researchRetrievalContext` → `researchLearnerContext` 순서로 AI가 경험 반영과 행동을 선택한다. 실제 UI 파일의 해시 검사와 내용/계정 대조를 함께 수행한다. 도움을 받은 연습·독립 확인·유지·전이를 구분하며, 성공 횟수로 숙달을 자동 작성하지 않는다. 기존 v1 결과는 보존하고 새 조건에 가져오지 않는다.

세 프로필의 trace 형식은 v2이며 provider/확률 정책은 policy `5`, Codex 직접 계획과 전체 계획은 policy `6`이다. 기본 provider actor 정책은 `episodic-choice-v4`다. v9 옵션 또는 v9 learner 신원을 명시한 provider는 `episodic-choice-v9`, 별도로 시작한 Codex 직접 계획과 전체 계획은 각각 `episodic-choice-v10`, `whole-trace-v3`다. 전체 계획의 새 기본 bundle 8 / candidate 7은 `taskContract:"persistent-task-memory-v1"`·`taskStateVersion:"persistent-task-v1"`에 기존 `memoryContract:"working-memory-v1"`·`cognitionVersion:"context-cognition-v1"`를 연결한다. candidate 7 knowledge audit는 `auditVersion:"6"`이며 열린 목표와 선택·완료·포기, focus와 기억 사용을 기록한다. legacy 6은 audit 5와 기존 기억 계약, 5는 focus 계약, 4와 명시형 3은 기존 검증을 유지한다. 기존 후보·trace를 새 계약으로 소급 변환하지 않는다. 정책 이름이 같아도 과제·기억 계약이 다른 표본을 같은 생성 조건으로 비교하지 않는다. 목표·상품 focus는 기억 내용이나 실제 구매를 자동 교정하지 않으며 목록을 읽는 결정 직전에는 그 행동으로 얻을 목표가 아직 알려져 있지 않다. 관심 동안 유지된 목표가 없으면 기억 부담은 `unexercised`로 보고하고 개선 증거로 삼지 않는다. 관심 매대를 열고 닫은 것과 실제 상품 집중·비교도 구분한다. 세계 참고 자료, 기억 분리와 repair 절차는 [전체 계획 절차](references/whole-trace.md)를 따른다.

상품 경험과 배치·조작 경험을 구분한다. `attentionExperience.visit`의 `first-play`/`revisit`로 회차 조건을 정하고, 반복 실험에는 create_learner로 만든 개인별 archive를 사용하고 실제 재생·DB 확인 경험만 이월한다. 단독 생성은 generate_trace의 learnerFile로 자동 로드한다. 이전 계획의 memory를 실제 수행 경험으로 승격하지 않는다. 현재 배치 키는 생성기가 계산한다. 다른 배치에서는 공간 기억을 이월하지 않고 학습한 조작을 별도로 유지한다. [실행 안내의 회차 경험](../market-simulator/README.md#주의-정책의-회차-경험과-재생)에 옵션 예시가 있다.

`trace.attentionExperience.source`는 `planned-trace`다. 미리 만든 계획의 기억을 실제 앱 학습의 증거로 보고하지 않는다. 주의 이탈·복귀는 생성 단계에서 계획되며 실제 재생 중 관찰에 따라 새로 결정하는 적응 분기는 없다. 앱에 완성된 trace 전체를 전달하고 실제 수행 여부는 재생 결과로 확인한다.

`maxActions`·`timeBudgetMs`·증분 LLM `maxCalls`는 기술 실행 예산이다. 이를 초과한 생성은 기술 실패이며 인물의 포기나 완성 trace로 바꾸지 않는다. 아래 명시적 v9·v10·전체 계획의 행동 100회 관찰 상한과 별개여서, 해당 모드에서도 너무 작은 기술 예산은 100회 전에 오류를 낼 수 있다. 전체 계획은 후보 제출 횟수·수정 횟수를 별도로 기록하며 `maxCalls`를 모델 행동 수로 보고하지 않는다. `attentionTag`·`cueRefs` 같은 기록은 생성 조건의 감사 정보이며 인물의 발화·실측 심리 상태가 아니다.

명시적으로 선택한 AI 정책 `episodic-choice-v9`는 새 관측·도착 여부·반복 이동 결과를 기록하되, 반복을 이유로 재검토를 지시하거나 종료하지 않는다. 모델이 선택하는 첫 100회에는 배회·관심 전환·재방문·휴식·도움·포기를 계속 허용하며, 다른 길이나 정답을 강제로 선택하지 않는다. 선택지는 행동마다 안정적인 ID를 갖고 seed/판단 순번에 따라 정답과 무관하게 제시된다.

`episodic-choice-v9`·`episodic-choice-v10`·`whole-trace-v3`에서는 모델이 선택해 적용한 상위 행동을 최대 100회 관찰한다. 기본 `generate_trace`의 v4는 기존 기술 실행 상한을 사용한다. 게임 시작·이동의 세부 입력·이후 시스템 처리 단계는 이 수에 포함하지 않는다. 100번째를 포함해 모델이 제출·자발적 포기를 선택하면 그 결과를 따른다. 100회 후에도 진행 중일 때만 **그때의 장바구니 그대로 계산·분석 접수하는 시스템 구간**을 추가한다. 빈 장바구니도 그대로 제출하며 상품을 담거나 빼거나 정답으로 보정하지 않는다. 기존 이동 입력으로 계산대까지 이동하고, 직원이 없으면 직원에게 호출을 요청한 뒤 `submitForReview → awaitReviewAccepted → leave`로 끝낸다. [행동 상한 기준](../market-simulator/README.md#행동-100회-상한과-시스템-계산)은 관찰 범위이며 장애 특성이나 임상 기준이 아니다. 확률 모드의 종료 정책은 바뀌지 않는다.

`generation.systemCompletion = {reason:"action-limit", afterDecisions:100, actionLimit:100, firstStepId, checkoutId, cartAtStart}`로 시스템 구간과 당시 장바구니를 기록한다. `firstStepId`부터는 시스템이 결정한 처리이므로 페르소나가 스스로 계산대를 찾아 제출한 능력으로 보고하지 않는다. 실행·DB 증거와 실제 제출 장바구니의 일치를 확인한 뒤 **시스템 구간 이전의 경험만** 개인 기억으로 저장한다. 자동 이동·계산·직원 호출은 다음 회차 경험에 넣지 않는다. 이 회차는 `assisted-submission`으로 분석·다음 퀘스트 연결을 이어갈 수 있지만, `performanceEligible:false`와 `metrics:null`로 독립 완수 비교에서 제외한다. 제출 내용의 누락·초과 등은 별도 측정에 남긴다. 계획에 분석 접수 단계가 있어도 실제 서버 접수·분석 `READY`는 별도로 확인한다. 생성 중 `.generation/` 진단 자료는 완성 trace·실행 경험 대신 사용하지 않는다. 새 정책 실험은 이전 개인·실험을 덮어쓰지 않고 별도로 만든다.

기존 v6/v7의 반복 정체 종료와 v8의 100회 포기 종료는 `generation.controlledStop`으로 계속 구분한다. 호환 검증을 유지하되 v9의 시스템 계산과 섞거나 메타데이터를 지워 자발적 수행으로 바꾸지 않는다. 기술 오류로 생성이 끊긴 자료도 시스템 계산을 완료한 trace로 보고하지 않는다.

## 맞춤 퀘스트와 경험의 반복 검증

반복 학습·맞춤 과제 효과 요청에는 [학습 실험 절차](references/learning-trials.md)를 읽는다. v9 신원으로 만든 learner를 사용하는 provider 학습 경로는 create_learner → create_learning_trial → generate_learning_round → play_trace → 실행/DB 증거 수집 → record_learning_round → 다음 분석 READY/AI 퀘스트 확인을 이어 간다. compare_learning_trial로 미완료와 기술 실패를 포함해 보고한다. 전체 계획은 `create_whole_trace_learner`로 새 개인을 만들고 `whole-trace-v3` 새 trial에서 `prepare_whole_trace({trialFile,arm,...})` → 후보 작성·제출을 사용한다. 나머지 실행·증거·다음 분석 절차는 동일하며 [전체 계획 절차](references/whole-trace.md)에 예시가 있다. 이전 전체 계획 정책의 개인·trial은 덮어쓰지 않고 기존 provider 실험·기억과도 섞지 않는다. 전체 계획 도구만 호출하고 앱 실행·분석이 완료됐다고 보고하지 않는다.

같은 개인의 성격·모델·정책과 호출 상한을 고정한다. A는 일반 과제+기억, B는 맞춤 과제+기억, C는 맞춤 과제+이전 기억 미전달이다. 계정을 분리하고 기준/평가 과제를 사전 고정한다. 기억 없는 C도 같은 회차 안의 관찰은 유지한다. 시간·도움 횟수 감소를 자동 성장으로 해석하지 않는다. 개선되지 않은 결과도 그대로 보존한다.

도움과 직원 응답은 실제 앱과 공유한 문구만 전달한다. 안내가 있었다는 사실은 이해했다는 뜻이 아니다. reason은 모델이 만든 행동 설명이며 성장이나 내면 상태의 증거로 쓰지 않는다. 현재 도구는 회차 준비·기억 전달·증거 검증을 자동화하고, 앱 진입·분석 응답 수집·다음 미션 로딩은 Codex가 기존 앱/서버 도구로 수행한다. 준비 도구만 호출하고 실제 플레이·학습이 완료됐다고 보고하지 않는다.

## 표본 차이와 재현

**새 독립 표본에는 새 seed를 쓴다.** 반복 실험의 회차 seed는 trialId에서 생성되고 고정되므로 수동 변경하지 않는다. 독립 반복에는 새 trialId와 개인 파일을 만든다. 같은 snapshot·정책/페르소나 버전·seed·입력 attentionExperience는 확률 모드 재현용이다. 같은 seed를 독립 표본으로 중복 보고하지 않는다. AI 모드 새 모델 호출은 seed 재현을 보장하지 않으므로 저장된 완성 trace를 다시 재생한다. 모델 실패를 확률 모드로 조용히 바꾸지 않는다.

같은 미션의 여러 seed와 다른 페르소나를 비교한다. 지연시간뿐 아니라 비교한 선반 페이지·선택 후 목록 확인·계산 전 확인·친숙한 상품 선택·관심 구간·방향 전환·복귀 차이를 보고한다. 대안이 없는 지정 상품에서 가격 비교의 효과를 부풀리지 않는다. “이유 없는 반복 금지”를 “모든 행동이 구매에 직접 유용해야 한다”로 해석하지 않는다. 실수·이탈 quota나 제출 전 완벽한 장바구니 복구를 강제하지 않는다. `reason`은 짧은 관찰 기술도 허용하며 인물의 자기설명이나 내부 사고 과정을 요구하지 않는다.

발화·억양·표정·유도 질문이 없는 게임에서 그런 행동을 만들어내거나 동의 편향의 임상적 타당성을 주장하지 않는다. 장애나 연기 사실을 게임 행동에 노출하지 않되 실험 보고에는 합성 정책 출처와 실제 사용 모드를 명시한다.

MCP를 사용할 수 없으면 `cli.cjs interactive`의 지속형 프로세스로 같은 도구를 호출한다. 단독 파일 생성·검증은 `cli.cjs generate`/`validate`를 사용한다. 전역 Codex 설정이나 플러그인을 자동 설치하지 않는다.


## 브라우저 MCP 제어 연결

브라우저에서 직접 행동을 제어하는 도구는 [market-agent-mcp](../market-agent-mcp/README.md)에 통합되어 있다. `market_bridge_status`, `market_start`, `market_observe`, `market_move`, `market_act`, `market_stop`, `market_export_episode`를 제공한다. 기존 앱 재생 입력과 MCP 제어는 서로 다른 실행 경로이므로 실제 사용 경로를 기록하고 같은 조건으로 혼합하지 않는다.

현재 연구 참고 학습 실험에서는 [직접 배우 학습 규약](assistant-learning-protocol.md)에 따라 배우 자신의 관찰과 회상을 사용한다. MCP를 사용해도 선택한 실제 페르소나 ID·버전·실행 ID를 기록하며, 예전 단일 페르소나를 자동으로 대신 적용하지 않는다. MCP 관찰과 종료 감사 기록의 공개 범위를 구분하고 숨은 상품·정답·사후 분석을 행동 입력으로 사용하지 않는다.

[이전 MCP 실행 절차](references/legacy-mcp-workflow.md)는 과거 방식의 재현용 참고 자료로 유지한다.
