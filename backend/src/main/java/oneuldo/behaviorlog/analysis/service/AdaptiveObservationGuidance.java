package oneuldo.behaviorlog.analysis.service;

public final class AdaptiveObservationGuidance {
    private AdaptiveObservationGuidance() {}
    public static final String RULE="행동·이동 심층 관찰: 목표·실제 재고·제공 안내·당시 지형을 사건 순서와 연결한다. "
        +"목록/상품 비교→선택→직원/부탁한 사람 문의→수정의 전후와, 그 사이 이동/막힘/재방문을 함께 읽는다. "
        +"이동 샘플 수를 충돌 횟수로 세지 않고 반품·문의·의도적 탐색·조작 원인 가능성을 구별한다. 로그만으로 시선·인지·동기는 확정하지 않는다. "
        +"품절 과제는 원래 상품 구매를 무조건 요구하지 않는다. runtimeState.learning.stockout의 staffChecked와 승인/구매불가 전달, "
        +"effectiveObjectives 및 실제 제출을 대조한다. 대체 승인 전 구매와 승인 후 구매를 구별한다. 선택 음료와 계산 정정도 실제 활성 조건으로 평가한다. "
        +"제공된 도움 뒤 수행과 독립 수행을 구별하고 미관측 능력은 uncertainties에 남긴다. 다음 연습은 어떤 근거로 무엇을 유지/변경하고 무엇을 관찰할지 practicePlan에 연결한다. "
        +"현재 실행 기능은 기존 classic/aisles/corner 구조·상품군 매대 위치·직원/손님/기둥/계산원 수·셀프계산대·입구공사·재고·품절/대체/선택음료/계산오류다. "
        +"startingConditions.displayedRuntimePreview는 플레이 전에 실제로 알려 준 조건이다. 품절/오류가 미리 고지된 연습을 예고 없는 독립 발견으로 해석하지 않는다. AI 계획과 실제 적용은 구분한다. 실제 설정·지형·제공 도움을 비교하지 않고 학습/독립성/이동 부담 개선을 단정하지 않는다.";
}
