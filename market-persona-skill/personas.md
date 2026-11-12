# 페르소나 선택

`list_personas`로 현재 버전과 설정을 확인한다.

프로필·정책 수정 후 기존 MCP/Node가 이전 버전을 반환하면 프로세스를 재시작한다. 공유 앱 코드도 바뀌었다면 새 번들을 로드하고 다시 연결한다. 저장된 trace는 자동 변경되지 않으므로 새 설정으로 새 trace를 생성한다.

| ID | 특성 |
| --- | --- |
| `mild-intellectual-disability-adult` | v5. 지민, 32세. 구체적인 한 항목씩 처리하며 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레를 좋아하고 스스로 목표로 복귀할 수도 있다 |
| `careful-checker` | v3. 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 강점이며 낯선 배치·조작과 여러 조건을 처리할 때 시간을 갖고, 비교·목록·장바구니 확인을 지원 전략으로 쓴다 |
| `quick-decider` | v3. 민수, 29세. 익숙한 상품에서는 빠르게 결정한다. 이름·규격·수량을 함께 기억해야 할 때 일부 조건을 놓칠 수 있고, 실제 불일치와 명확한 단서를 확인하면 선택을 수정한다. 좋아하는 상품은 짧게 살핀다 |

실행 정의의 단일 원본은 [지민](../market-simulator/personas/mild-intellectual-disability-adult.json), [서연](../market-simulator/personas/careful-checker.json), [민수](../market-simulator/personas/quick-decider.json)의 구조화된 JSON이다. 전체 계획과 증분 계획은 같은 JSON에서 개인 특성을 읽고 모드별로 성격을 다시 정의하지 않는다. 세 명 모두 **경도 지적장애가 있는 허구의 성인**이며 선택한 인지·적응 특성과 개인 성격이 서로 다르다. 각자의 강점·취향·경험·선택권을 유지하고 모든 어려움을 한 인물에게 합치지 않는다. 절약·빠른 결정·카레 선호 자체를 장애 특성으로 설명하지 않는다. 확률 수치는 합성 정책의 설계값이며 사람이나 장애 집단에서 추정한 통계가 아니다. AI 모드는 character를 전달하며 practicedStrategies는 시작 시점의 습관이다. learningProfile은 관찰할 연습 영역과 전이 조건이며 행동 의무나 숙달 점수가 아니다. 확률 모드가 자연어의 모든 문장을 해석한다고 설명하지 않는다.

세 프로필의 근거를 확인하거나 수정할 때는 [사용자 역할 요청](../market-simulator/personas/references/persona-role-request.ko.md), [행동 이해 자료 전문](../market-simulator/personas/references/intellectual-disability-behavior-analysis.ko.md), [대응과 한계](../market-simulator/personas/audit.md)를 읽는다. [지민 v5](../market-simulator/personas/persona-mild-intellectual-disability-adult-v5.md), [서연 v3](../market-simulator/personas/persona-careful-checker-v3.md), [민수 v3](../market-simulator/personas/persona-quick-decider-v3.md) 사본은 각각 JSON prompt와 같다. 세 prompt에 두 원자료 전문을 보존하되, 자료 전체의 특성을 매번 모두 연기하지 않는다. 원문을 전달하거나 게임 행동 차이를 확인한 사실을 임상적 타당성 검증으로 설명하지 않는다.

전체 계획의 `bundle.persona.behavior`는 같은 JSON에서 상세 개인 지침, 목표 기억 용량, 반응/보행 기준과 상황별 인지 설정을 가져온다. 관심 전환, 유사 상품 구분, 수량 추적에 연결하는 설정은 합성 부담의 설계값이며 강제 오답 확률이나 임상 척도가 아니다. 새 성격을 정의하거나 원자료의 모든 어려움을 추가하지 않는다. candidate 7은 매 결정에 nullable `basis.goalId`와 배열 `basis.memoryUses`를 적고, 선택적 `actorState.taskUpdate`로 목표의 선택·완료·포기를 선언한다. `focusedGoalId:null`이나 관심·탐색 전환만으로 열린 목표를 `heldGoalIds`에서 지울 수 없다. `actorState.memoryUpdate`는 믿는 값·불확실성의 선언이며 목표 종료를 대신하지 않는다. 수락된 명시적 완료는 `taskMemory.completedGoalIds`에 ID만 기록한다. 표시된 모든 목표를 완료한 뒤 목록을 다시 확인해도 목표 재선택을 강제하지 않으며, 이 이력으로 이름·수량 기억이나 구매 정답을 복원하지 않는다. 작업 기억과 과제 상태 snapshot은 코드가 계산한다. 관찰 원장에 정확한 목표가 남아 있거나 컴파일러가 objective proof를 연결했다는 이유로 잊힌 세부를 정확하게 복원하지 않는다. focus와 기억·과제 계약, 표시된 목록·장바구니의 범위는 [전체 계획 절차](generation/whole-trace.md)를 따른다. 이 상태와 근거는 허구의 공개 행동 요약이며 실제 내면 사고·발화·심리 측정이 아니다.

## 생성 중 성격 표현

페르소나의 성격 정의는 기존 JSON 하나다. 지민의 관심 전환과 목록을 통한 복귀, 서연의 비교·확인과 신중함, 민수의 익숙한 상품 선택과 여러 조건의 부담을 가능한 상황에서 표현한다. 낯선 통로에서 망설이거나 되돌아가기, 관심 상품을 살피기, 목표를 잠시 놓쳤다가 목록·단서를 보고 복귀하기를 허용한다. 행동마다 구매 진전·최단 경로를 요구하지 않는다. 실수·방황 횟수를 채우거나 모든 선택을 정답으로 교정하지 않는다. 상황에 따라 안정적으로 수행하는 강점과 일반적인 성인의 취향·목표도 유지한다.
