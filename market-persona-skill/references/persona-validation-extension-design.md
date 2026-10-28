# 검증 자료 출처 확장 메모

이번 검증은 합성 whole-trace의 설계 성향 표현과 판정 가능성을 다룬다. 실제 지적장애인과의 유사성을 입증하지 않는다. 실제 사람의 로그 수집·분포 비교·C2ST·실제 trace를 섞은 판별은 구현하지 않는다.

지표 계산은 파일 저장·모델 호출과 분리한 순수 함수다. `personaValidationMetrics.cjs`와 `personaValidationSequence.cjs`는 trace, snapshot, persona, audit와 선택적 근거를 입력받는다. 파일 출처·버전·프로필 검증은 run 계층이 담당한다. 미래의 별도 어댑터도 동일한 행동·관찰·시스템 구간 의미를 충족해야 하며, 없는 관측이나 대기시간을 합성해서 채우지 않는다.

새 보고서의 `referenceComparison: null`은 아직 참조 비교를 실행하지 않았다는 자리다. 다른 출처의 자료를 붙이는 경우 별도 사전 설계, 자료 이용 범위, 표본·측정 동등성, 불확실성 처리가 필요하다. 이 자리를 채운다는 이유로 현재 기준의 의미를 바꾸거나 합성 자료의 통과를 실제 집단의 타당성으로 해석하지 않는다.

legacy 명세 v3와 성향 명세 v2는 주 지표·유효 쌍 8·|delta| 0.33·95% 구간 0 제외·플래그 10%를 유지한다. 추가 분석은 새 run의 `analysisVersion:1`에 묶는다. 기존 명세 원문은 `market-simulator/validation/archive/`에 보존하고 저장된 specHash로 읽는다. 과거 manifest에 분석 버전을 추가하거나 trace·bundle·보고서를 일괄 변환하지 않는다.

보관 명세 run의 진행 조회는 manifest를 다시 쓰지 않는다. 동일한 재측정은 저장 결과를 재사용하고 결과가 달라지면 새 runId를 요구한다. 이미 있는 과거 보고서는 `historicalArtifactPreserved:true`로 반환한다. 과거 run에 새 설명 지표를 소급 계산하지 않는다.
