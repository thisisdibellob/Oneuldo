# 결과 파일·감사·비교 조건

생성이 끝난 뒤 trace 메타데이터, knowledge audit, persona review를 해석하고 표본을 비교할 때 읽는다.

새 trace는 actor 정책 `whole-trace-v3`, trace schema `2`/policy `6`, `planningMode:whole-trace`를 유지한다. `observationScope:whole-world`는 모델이 받는 실제 세계 참고 범위이며 `actorKnowledgeScope:observed-and-remembered`는 선언 지식의 범위다. 새 기본 bundle/candidate는 8/7이고 `actorStateVersion:"1"`은 유지한다. candidate 7 knowledge audit는 `auditVersion:"6"`, `taskContract:"persistent-task-memory-v1"`·`taskStateVersion:"persistent-task-v1"`와 기존 `memoryContract:"working-memory-v1"`·`cognitionVersion:"context-cognition-v1"`를 기록한다. source-bound 선택과 focus는 `actionBinding:"state-bound-choice-v1"`·`focusContract:"explicit-focus-v1"`로 기록한다. legacy 6은 audit 5와 기억 계약, 5는 audit 4와 focus 계약, 4는 audit 3, 3은 audit 2와 `actionBinding:"explicit-legacy-v3"`를 유지한다. goal/product matcher 전이는 행동 뒤 sidecar에서만 계산한다. 기존 후보·trace와 v1/v2 trace 재생을 유지하고 새 계약으로 소급 수정하지 않는다. 요청의 snapshot·프로필·seed·기억은 준비 시 고정한다. 새 모델 출력의 seed 재현은 보장하지 않으며 검증된 후보·trace로 재현한다.

성공 결과의 `knowledgeAuditPath`·`knowledgeAuditHash`는 `<trace 경로>.knowledge-audit.json`을 가리킨다. candidate 7 audit 6에는 관찰 사실 원장, 계산한 열린 목표·작업 기억, goalId·taskUpdate·memoryUses·memoryUpdate와 출처, 단계별 actorState·선언 및 파생 근거·실제 선택을 기록한다. candidate 6/5/4/3은 각각 기존 audit 5/4/3/2를 유지한다. 모든 버전은 전체 세계가 모델 문맥에 들어 있다는 한계를 남긴다. 원장·기억·단서 검증은 실제 Luna의 인지 과정·앱 재생·DB 수신·임상적 재현을 검증하지 않는다. 감사 자료를 앱 행동 로그에 임의로 넣거나 실제 사람의 발화로 표시하지 않는다.

역할 표현의 검토는 별도 `<trace 경로>.persona-review.json`과 결과의 `personaReviewPath`·`personaReviewHash`·`personaReview`에 남긴다. `status:"review"`이면 경고의 코드·해당 판단 인덱스·설명을 보고한다. `status:"clear"`는 자동 검사에서 경고가 발견되지 않았다는 뜻이며 페르소나의 임상적 타당성이나 완전한 재현 판정이 아니다. 경고는 구조·지식·가시성·재고·보행 오류와 분리하고, 경고를 없애려고 행동을 교체하거나 실수·방황·도움·포기를 강제하지 않는다. 기술적으로 유효한 trace에도 표현을 검토할 이유가 있을 수 있으므로 파일 저장/검증 성공과 역할 검토 결과를 함께 보고한다.

역할 검토의 `auditVersion`은 `actor-fidelity-v2`다. 실제 accepted `add`/`remove`에 대한 상품→목표 연결과 focus 전이를 행동 실행 뒤 비교한다. 해당 인물의 프로필에 목록 재확인 습관이 있는 경우에만 그 습관을 검토한다. 지민은 실제 다음 목표 상품을 구매하기 전에 이전 구매 뒤 실제 `readList`가 없으면 `NEXT_GOAL_WITHOUT_LIST_RECHECK`를 검토한다. 단, 실제 구매와 선언 focus goal이 불일치하면 possible mistake로 보고 이 습관 위반 판정은 보류하되 실제 상품 transition facts는 보존한다. 관심 후 실제 goal-product 구매가 있으면 `activity:"shop"` label 여부와 무관하게 복귀를 살핀다. `recover`라는 활동 label만으로 관심 복귀 근거를 대신할 수 없다.

경고 코드는 `UNIFORM_REACTION_DELAYS`(반응 지연이 한 값으로만 반복), `NEXT_GOAL_WITHOUT_LIST_RECHECK`(실제 다음 목표 구매 전, 이전 구매 후 `readList` 재확인 없음), `INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY`(관심 복귀에 기록된 근거 없음; recover label만으로는 부족), `FOCUS_ACTION_MISMATCH`(현재 상품 focus와 add/remove 대상 불일치), `FOCUS_GOAL_SELECTION_MISMATCH`(실제 add 목표와 goal focus 불일치), `UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE`(실제 확인/관찰과 관련된 cue 없이 uncertainty 해소 선언)다. `FOCUS_GOAL_SELECTION_MISMATCH`는 실제 구매가 possible mistake일 수 있음을 나타내는 soft warning이다. goal mismatch가 있으면 `NEXT_GOAL_WITHOUT_LIST_RECHECK` 판정은 보류하고 실제 상품 transition fact는 남긴다. 관심 복귀 확인은 관심 뒤의 실제 goal-product 구매를 기준으로 하며 `activity:"shop"`에 한정하지 않는다. `recover` label 단독은 근거가 아니다. 모든 warning은 행동이나 구매를 교정하지 않는다.

`summary`는 `decisions`, `distinctReactionDelays`, `activityCounts`, `maximumHeldGoals`, 실제 선택 목표 기준 `goalSwitches`, `focusGoalSwitches`, `productSwitches`, `interestReturns`를 담는다. `focusCoverage`는 `recordedDecisions`와 `unrecordedDecisionIndexes`를 구분한다. `transitions`의 purchase-goal, focus-goal, interest-return, uncertainty-cleared 항목은 `decisionIndexes`·`cueRefs`와 적용 가능한 `checkDecisionIndexes`, `listRechecked` 등을 보존한다. purchase-goal 항목에는 `selectionFocus:"consistent"|"unrecorded"|"different-goal"|"no-goal"`을 기록한다. `situations.unfamiliar`는 시작 orientation·국소 cue·새 매대를, `memoryLoad`는 실제로 읽은 목표가 용량을 넘었는지·선언된 uncertainty·check 인덱스를, `interestExposure`는 `categorySignDecisionIndexes`, `productDecisionIndexes`, `interestDecisionIndexes`를 각각 기록해 실제 category sign과 상품 노출을 구분한다. 이는 행동 해석에 필요한 coverage와 상황 정보다. 목표 수가 설계 용량을 넘었다는 기록은 임상적 기억 부담 측정이 아니며, 낯섦·관심 노출도 표현이 명확하거나 이해됐다는 보증이 아니다. 경고가 없다는 `clear` 역시 표현의 완전성·임상적 타당성을 보증하지 않는다.

candidate 7의 `personaReview.taskExpression`은 `task-expression-v1`로 이동 중 목표 기억, 관심 동안의 pending 목표, 불확실성과 이후 회복, 실제 관심 상품 focus를 별도로 기록한다. coverage가 `unexercised`이면 기억 부담·회복을 관찰하지 못한 표본이며 개선 증거로 삼지 않는다. 열린 목표가 유지됐다는 사실만으로 어려움이 발현됐다고 판정하지 않는다. 불확실성 뒤 회상·guess·실제 확인이 있었는지 단계의 관찰 시점에 맞춰 살핀다. `INTEREST_PRODUCTS_WITHOUT_FOCUS`와 `UNIFORM_ORIENT_WALK_DELAYS`는 추가 soft warning이다. 관심 매대를 열고 닫은 것, 실제 상품 focus, 종류·맛·규격 비교 행동은 구분하고 reason만으로 비교를 인정하지 않는다. 경로 재방문은 왕복 이동일 수 있어 방황으로 단정하지 않는다. 확인·실수·관심·헤맴 횟수를 강제로 넣어 coverage나 경고를 바꾸지 않는다.

가이드 v2로 준비한 요청에는 별도 `personaReview.annotationReview`(`reviewVersion:"actor-annotation-v1"`)를 기록한다. 자체 `status`, `findings`, 관찰 한계를 가지며 기존 `actor-fidelity-v2`의 최상위 상태·경고 의미를 바꾸지 않는다. `CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK`는 `closeStation`/`closeView`만 수행하면서 `activity:"check"`로 적은 경우를 검토한다. 같은 페이지의 `pause`·`lookAround`·`browse`는 실제 정보를 살펴볼 수 있으므로 이 경고로 단정하지 않는다. 기존 두 focus mismatch도 근거와 함께 옮겨 담고, 각 항목에 `improvementTarget`, `recommendation`, 결정 인덱스·행동·선언·단서의 `evidence`를 제공한다. 이 검토는 기술 실패로 처리하거나 행동·구매를 고치지 않는다. 최상위 `clear`와 주석 검토 `clear`를 구분하며, 과거 가이드에서 항목이 없으면 미실시로 보고한다.

actor 정책 이름이 같아도 bundle/candidate·taskContract·memoryContract·cognitionVersion이 다른 표본은 같은 생성 조건으로 묶지 않는다. 모델 문맥에는 세계 참고 자료로 전체 맵·목표·상품·재고가 들어 있다. 인물 지식과 행동 근거는 단계별로 감사하지만 이 사실만으로 모델 내부의 숨은 정보 영향을 증명할 수는 없다. 기존 제한 관찰 모드와 정보 노출 조건을 같다고 보고하거나 이전 전체 계획 정책의 결과와 같은 조건으로 수행 향상을 비교하지 않는다. 분석 서버의 결과나 숨은 성공 판정을 플레이 기억에 주입하지 않는다.

숨은 배치 검사는 현재 화면·개인·기억이 같은 상태에서 화면 밖 상품 배치만 바꿔 실시한다. 발견 전에는 미발견 상품·장소를 행동 근거로 사용할 수 없어야 하고, 배치 차이가 실제 화면에 나타난 뒤에는 다른 선택이 가능하다. 가시성과 알려진 단서의 변화는 컴파일러 검사로 확인하고, Luna가 발견 전에 숨은 목표를 향하는 편향은 별도 반복 표본으로 조사한다. native Luna 새 호출의 출력은 같은 seed로도 동일성이 보장되지 않으므로 두 새 호출의 행동 배열이 다르다는 사실만으로 정보 누출이라고 판정하지 않는다. 하나의 근거 감사 통과나 표본 차이만으로 페르소나의 인지·적응 특성 재현 또는 임상적 타당성을 입증했다고 보고하지 않는다.

속도는 입력 준비부터 최종 검증·파일 저장까지 측정한다. 후보 작성·제출·컴파일·수정 소요를 포함하고 실패도 보고한다. `planningAndDeliveryWallMs`는 요청 생성부터 최종 후보 컴파일 시작까지의 누적 간격으로, 작업 대기·모델 판단·도구 전달을 포함한다. 수정 제출이 있으면 이전 시도의 컴파일·진단 저장 시간도 이 간격에 포함되므로 순수 모델 추론이나 통신 시간으로 해석하지 않는다. `compileAndValidationMs`·`persistenceMs`는 최종 성공 시도의 처리 시간이고 `wholeRequestWallMs`는 요청 생성부터 trace 저장까지다. 직접 확인한 계획 제출 횟수와 도구 호출 수를 기록한다. Codex 내부 추론/API 횟수는 제공되지 않으면 미확인으로 남긴다. 모델 전체 출력 1회가 항상 더 빠르다고 보고하지 않으며 긴 입력·출력과 수정 비용을 기존 모드와 같은 게임·페르소나 조건에서 비교한다. 로컬 검증 성공은 화면 재생·DB 저장·분석 `READY`의 증거가 아니다.

## 배우 기록 감사(스크립트 우선)

실행이 끝나면 `node market-simulator/scripts/audit-actor-records.cjs <실행 폴더>`로 `scripted-record-audit.json`을 만든다(읽기 전용, 덮어쓰지 않음). 스크립트는 기록으로 판정할 수 있는 항목만 확정한다.

- 재작성 때 처음 고른 행동이 바뀌었는지, 그리고 그 원래 선택지가 직전 메뉴에 있었는지
- 전달된 호출의 입력·stdout·stderr·exit 기록 누락. 전달되지 않은 로컬 시도는 따로 센다.
- 입력 초안 덮어쓰기, 자기 보고와 owner 원장의 수 차이, 기술 실패 코드, 수락 문장의 한자·가나·영어 단어

금지 경로 언급, 파일 목록 조회, 반복문으로 행동을 만들었다는 의심, advisory 출력, 자기 보고 불일치의 이유는 판정하지 않고 `reviewQueue`에 넣는다. 감독은 원본 로그 전체가 아니라 이 대기열 항목만 별도 검토자에게 넘긴다. 지시문·코드·배우 방식이 바뀐 첫 실행에서는 에이전트 전체 감사도 함께 돌린다. 체크리스트에 없는 새 문제는 스크립트가 찾지 못하기 때문이다. 기준 대조는 `output/persona-4item-h200-20261116-210743/AUDIT-COMPARISON.ko.md`에 있다.
