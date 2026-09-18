package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import java.util.Map;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Collector documentation and source coverage, not an interpretation of the player's behavior. */
public final class AnalysisSourceContext {
    private AnalysisSourceContext() {}
    public static final String REVIEW = "먼저 구간별 한계를 sourceEventDetails 및 전체 coverage와 대조한다. "
            + "다른 구간 원본에서 확인한 사실은 최종 '미확인' 목록에 남기지 않는다. 모든 기록이 제공되어도 동기·이해·실제 생활 능력은 별개다. "
            + "사실 문장은 원본이 기록한 행위 범위까지만 쓰고, 해석과 성패 판단은 그 다음에 AI가 작성한다. "
            + "장바구니 열기를 실제 읽기·검증으로 확장하지 않는다. 제출 조작만으로 세션 종료를 만들어 쓰지 않는다. 해석은 관찰 행동과 실제 과제 목표의 관계를 설명한다. 인지·이해·의도는 가능성이라는 말만 붙여 가정하지 않고 직접 근거가 없으면 불확실성으로 남긴다. 대안 설명은 기록상 근거가 있을 때만 제시한다. 없으면 alternativeExplanations는 []로 두고 동기 미확인은 uncertainties에 명시한다. "
            + "오류·지연·자동 동작을 단지 가능하다는 이유로 추가하지 않는다. "
            + "지원 문장과 practicePlan의 품목 수·수량·예산·문자 지원을 서로 대조한다. 구현되지 않은 지도 추가나 질문 기능을 실행 계획으로 약속하지 않는다.";
    public static tools.jackson.databind.JsonNode definitions(ObjectMapper mapper) {
        return mapper.valueToTree(List.of(
                Map.of("eventCode","SHOP.ITEM_SEARCH_STARTED", "collectorMeaning","이동 시작 또는 재시작의 자동 기록", "notEvidenceOf","검색창 사용, 상품 인지, 목표 이해"),
                Map.of("eventCode","SHOP.CHECKOUT_SUBMITTED", "collectorMeaning","장바구니를 제출하는 조작 기록; AI 검토 흐름에서는 검토 요청 버튼 조작", "notEvidenceOf","서버 접수 성공, 결제 확정, 과제 성공"),
                Map.of("eventCode","SHOP.SESSION_ENDED", "collectorMeaning","세션 기록 수집 종료", "notEvidenceOf","과제 성공 또는 실패"),
                Map.of("reason","EXIT_AFTER_SUBMISSION", "collectorMeaning","제출 조작 후 화면 나가기; 접수 성공이나 성패는 뜻하지 않음"),
                Map.of("reason","FLOW_FINISHED", "collectorMeaning","앱 흐름의 종료 처리; AI 수행 판정이 아님"),
                Map.of("collectorTaskVersion","market-micro-behavior-v2-content", "collectorMeaning","이 버전은 완료 처리와 제출 후 나가기도 USER_ABORTED로 기록할 수 있었음. 옛 reason만으로 중도 포기를 단정하지 말고 제출·수량 등 원본과 함께 판단")));
    }
    public static ObjectNode coverage(ObjectMapper mapper, BehaviorAnalysisInputResponse scope) {
        var node=mapper.createObjectNode();node.put("providedEventCount",scope.eventCount());
        var sessions=node.putArray("sessions");
        for(var session:scope.input().sessions()) {
            var row=sessions.addObject();row.put("sessionId",session.sessionId().toString());row.put("eventCount",session.events().size());
            if(!session.events().isEmpty()) {
                row.put("firstEventId",session.events().getFirst().behaviorLogId().toString());
                row.put("lastEventId",session.events().getLast().behaviorLogId().toString());
            }
            row.set("recordDelivery",mapper.valueToTree(session.integrity()));
        }
        node.put("meaning","제공한 원본의 범위와 수신 상태다. 행동의 완료·성공 여부는 아니다.");
        return node;
    }
}
