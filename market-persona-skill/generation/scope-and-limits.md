# 생성 범위·상한·재현

현재 경로(whole-trace 작성 보조 모드)를 포함한 모든 생성에 공통으로 적용되는 계획의 범위, 행동 상한과 시스템 계산, 표본·재현 규칙이다.

## 계획의 범위와 회차 경험

상품 경험과 배치·조작 경험을 구분한다. `attentionExperience.visit`의 `first-play`/`revisit`로 회차 조건을 정하고, 반복 실험에는 create_learner로 만든 개인별 archive를 사용하고 실제 재생·DB 확인 경험만 이월한다. 단독 생성은 generate_trace의 learnerFile로 자동 로드한다. 이전 계획의 memory를 실제 수행 경험으로 승격하지 않는다. 현재 배치 키는 생성기가 계산한다. 다른 배치에서는 공간 기억을 이월하지 않고 학습한 조작을 별도로 유지한다. [실행 안내의 회차 경험](../../market-simulator/README.md#주의-정책의-회차-경험과-재생)에 옵션 예시가 있다.

`trace.attentionExperience.source`는 `planned-trace`다. 미리 만든 계획의 기억을 실제 앱 학습의 증거로 보고하지 않는다. 주의 이탈·복귀는 생성 단계에서 계획되며 실제 재생 중 관찰에 따라 새로 결정하는 적응 분기는 없다. 앱에 완성된 trace 전체를 전달하고 실제 수행 여부는 재생 결과로 확인한다.

`maxActions`·`timeBudgetMs`·증분 LLM `maxCalls`는 기술 실행 예산이다. 이를 초과한 생성은 기술 실패이며 인물의 포기나 완성 trace로 바꾸지 않는다. 아래 명시적 v9·v10·전체 계획의 행동 100회 관찰 상한과 별개여서, 해당 모드에서도 너무 작은 기술 예산은 100회 전에 오류를 낼 수 있다. 전체 계획은 후보 제출 횟수·수정 횟수를 별도로 기록하며 `maxCalls`를 모델 행동 수로 보고하지 않는다. `attentionTag`·`cueRefs` 같은 기록은 생성 조건의 감사 정보이며 인물의 발화·실측 심리 상태가 아니다.

## 행동 100회 상한과 시스템 계산

`episodic-choice-v9`·`episodic-choice-v10`·`whole-trace-v3`에서는 모델이 선택해 적용한 상위 행동을 최대 100회 관찰한다. 기본 `generate_trace`의 v4는 기존 기술 실행 상한을 사용한다. 게임 시작·이동의 세부 입력·이후 시스템 처리 단계는 이 수에 포함하지 않는다. 100번째를 포함해 모델이 제출·자발적 포기를 선택하면 그 결과를 따른다. 100회 후에도 진행 중일 때만 **그때의 장바구니 그대로 계산·분석 접수하는 시스템 구간**을 추가한다. 빈 장바구니도 그대로 제출하며 상품을 담거나 빼거나 정답으로 보정하지 않는다. 기존 이동 입력으로 계산대까지 이동하고, 직원이 없으면 직원에게 호출을 요청한 뒤 `submitForReview → awaitReviewAccepted → leave`로 끝낸다. [행동 상한 기준](../../market-simulator/README.md#행동-100회-상한과-시스템-계산)은 관찰 범위이며 장애 특성이나 임상 기준이 아니다. 확률 모드의 종료 정책은 바뀌지 않는다.

whole-trace-v3는 `actionHorizon:200`을 명시하면 상한이 200회가 되고, 시스템 계산도 200번째 뒤에만 붙는다(검증 run은 `prepare_persona_validation`에 함께 묶음, 배우 지시문은 `authoring-v3-h200`). 자세한 조건은 [whole-trace 문서](../../market-simulator/docs/whole-trace.md#관찰-상한-옵션-actionhorizon200-선택-기본-100)를 따른다. 아래 설명의 100은 기본 상한 기준이다.

`generation.systemCompletion = {reason:"action-limit", afterDecisions:100, actionLimit:100, firstStepId, checkoutId, cartAtStart}`로 시스템 구간과 당시 장바구니를 기록한다. `firstStepId`부터는 시스템이 결정한 처리이므로 페르소나가 스스로 계산대를 찾아 제출한 능력으로 보고하지 않는다. 실행·DB 증거와 실제 제출 장바구니의 일치를 확인한 뒤 **시스템 구간 이전의 경험만** 개인 기억으로 저장한다. 자동 이동·계산·직원 호출은 다음 회차 경험에 넣지 않는다. 이 회차는 `assisted-submission`으로 분석·다음 퀘스트 연결을 이어갈 수 있지만, `performanceEligible:false`와 `metrics:null`로 독립 완수 비교에서 제외한다. 제출 내용의 누락·초과 등은 별도 측정에 남긴다. 계획에 분석 접수 단계가 있어도 실제 서버 접수·분석 `READY`는 별도로 확인한다. 생성 중 `.generation/` 진단 자료는 완성 trace·실행 경험 대신 사용하지 않는다. 새 정책 실험은 이전 개인·실험을 덮어쓰지 않고 별도로 만든다.

기존 v6/v7의 반복 정체 종료와 v8의 100회 포기 종료는 `generation.controlledStop`으로 계속 구분한다. 호환 검증을 유지하되 v9의 시스템 계산과 섞거나 메타데이터를 지워 자발적 수행으로 바꾸지 않는다. 기술 오류로 생성이 끊긴 자료도 시스템 계산을 완료한 trace로 보고하지 않는다.

## 버전·계약 이름

세 프로필의 trace 형식은 v2이며 provider/확률 정책은 policy `5`, Codex 직접 계획과 전체 계획은 policy `6`이다. 기본 provider actor 정책은 `episodic-choice-v4`다. v9 옵션 또는 v9 learner 신원을 명시한 provider는 `episodic-choice-v9`, 별도로 시작한 Codex 직접 계획과 전체 계획은 각각 `episodic-choice-v10`, `whole-trace-v3`다. 전체 계획의 새 기본 bundle 8 / candidate 7은 `taskContract:"persistent-task-memory-v1"`·`taskStateVersion:"persistent-task-v1"`에 기존 `memoryContract:"working-memory-v1"`·`cognitionVersion:"context-cognition-v1"`를 연결한다. candidate 7 knowledge audit는 `auditVersion:"6"`이며 열린 목표와 선택·완료·포기, focus와 기억 사용을 기록한다. legacy 6은 audit 5와 기존 기억 계약, 5는 focus 계약, 4와 명시형 3은 기존 검증을 유지한다. 기존 후보·trace를 새 계약으로 소급 변환하지 않는다. 정책 이름이 같아도 과제·기억 계약이 다른 표본을 같은 생성 조건으로 비교하지 않는다. 목표·상품 focus는 기억 내용이나 실제 구매를 자동 교정하지 않으며 목록을 읽는 결정 직전에는 그 행동으로 얻을 목표가 아직 알려져 있지 않다. 관심 동안 유지된 목표가 없으면 기억 부담은 `unexercised`로 보고하고 개선 증거로 삼지 않는다. 관심 매대를 열고 닫은 것과 실제 상품 집중·비교도 구분한다. 세계 참고 자료, 기억 분리와 repair 절차는 [전체 계획 절차](whole-trace.md)를 따른다.

## 표본 차이와 재현

**새 독립 표본에는 새 seed를 쓴다.** 반복 실험의 회차 seed는 trialId에서 생성되고 고정되므로 수동 변경하지 않는다. 독립 반복에는 새 trialId와 개인 파일을 만든다. 같은 snapshot·정책/페르소나 버전·seed·입력 attentionExperience는 확률 모드 재현용이다. 같은 seed를 독립 표본으로 중복 보고하지 않는다. AI 모드 새 모델 호출은 seed 재현을 보장하지 않으므로 저장된 완성 trace를 다시 재생한다. 모델 실패를 확률 모드로 조용히 바꾸지 않는다.

같은 미션의 여러 seed와 다른 페르소나를 비교한다. 지연시간뿐 아니라 비교한 선반 페이지·선택 후 목록 확인·계산 전 확인·친숙한 상품 선택·관심 구간·방향 전환·복귀 차이를 보고한다. 대안이 없는 지정 상품에서 가격 비교의 효과를 부풀리지 않는다. “이유 없는 반복 금지”를 “모든 행동이 구매에 직접 유용해야 한다”로 해석하지 않는다. 실수·이탈 quota나 제출 전 완벽한 장바구니 복구를 강제하지 않는다. `reason`은 짧은 관찰 기술도 허용하며 인물의 자기설명이나 내부 사고 과정을 요구하지 않는다.

발화·억양·표정·유도 질문이 없는 게임에서 그런 행동을 만들어내거나 동의 편향의 임상적 타당성을 주장하지 않는다. 장애나 연기 사실을 게임 행동에 노출하지 않되 실험 보고에는 합성 정책 출처와 실제 사용 모드를 명시한다.

MCP를 사용할 수 없으면 `cli.cjs interactive`의 지속형 프로세스로 같은 도구를 호출한다. 단독 파일 생성·검증은 `cli.cjs generate`/`validate`를 사용한다. 전역 Codex 설정이나 플러그인을 자동 설치하지 않는다.

## 행동 지연 시간

전체 계획의 `timingProfile` 기본값과 허용값은 `original`이다. 명시적 `compact` 요청은 거절한다. Luna가 제출한 `delayMs`를 보존하고, 개인 보행 기준은 기존 이동 의도로 변환하며 임의 지터나 compact 시간 압축을 추가하지 않는다. 결과는 `generation.timingProfile:"actor-preserved-v1"`·`generation.actorStateVersion:"1"`을 기록한다. 상세 반응 기준을 참고해 상황에 맞는 지연을 선택하되 매번 중앙값을 따르거나 시간이 부족하다는 이유로 모든 판단을 짧게 맞추지 않는다. 이동 시간은 별도의 물리적 보행이며 기존 충돌·이동 입력 상한과 정상 게임 루프를 유지한다.
