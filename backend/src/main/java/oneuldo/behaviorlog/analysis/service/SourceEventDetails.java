package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import java.util.Set;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** A readable copy of source values, never a behavioral score or inferred outcome. */
public final class SourceEventDetails {
    public static final String FIELD = "sourceEventDetails";
    public static final String RULE = "sourceEventDetails는 사건별 원본 값의 읽기용 사본이다. "
            + "각 객체는 한 사건의 사실이며 해석이 아니다. 같은 객체의 id/sequence/timeMs/상품/수량/장바구니를 함께 읽는다. 같은 세션의 사건 순서는 sequence로 확인한다. 여러 사건을 서술할 때 각 사건을 별도 절로 쓰고 시간 순서대로 나열한다. 장바구니 열기를 앞뒤 수량 변경과 하나의 동작으로 합치지 않는다. 필드가 없으면 미기록이며 0이나 미수행이 아니다. "
            + "이 사본은 상호작용·제한 시간·종료 값을 포함한다. 자동 이동·근접·재방문 원본은 sourceMovementContext와 관측 입력에서 확인하며 여기에는 중복 기재하지 않는다. "
            + "AI 구간 요약은 틀릴 수 있다. 기록이 없다는 주장, 수량 변경, 최종 장바구니를 이 사본과 대조하고 "
            + "상충하면 원본에 맞춰 해석을 수정한다. 출처가 없는 이전 세션 잔여물이나 기기 오류를 만들어 설명하지 않는다. "
            + "성패·의도·지원·난이도는 실제 목표와 자료 범위를 고려해 AI가 판단한다.";
    private static final List<String> VALUES = List.of("itemId", "stationId", "requiredQuantity", "selectedQuantity",
            "quantityBefore", "quantityAfter", "cartItemCount", "cartTotalAmount", "remainingBudgetAmount",
            "budgetAmount", "priceAmount", "paymentAmount", "paymentMethod", "substituteItemId",
            "objectiveCount", "briefingIndex", "durationMs", "idleDurationMs");
    // Event producer categories only; every source event still reaches the observation stage.
    private static final Set<String> MOVEMENT_EVENTS = Set.of("SHOP.ITEM_SEARCH_STARTED", "SHOP.MOVEMENT_SAMPLED",
            "SHOP.MOVEMENT_SEGMENT_SUMMARIZED", "SHOP.MOVEMENT_STOPPED", "SHOP.MOVEMENT_BLOCKED",
            "SHOP.MOVEMENT_BLOCKED_REPEATEDLY", "SHOP.MOVEMENT_UNBLOCKED", "SHOP.OFF_TARGET_DWELL",
            "SHOP.ROUTE_LOOP_DETECTED", "SHOP.SHELF_PROXIMITY_ENTERED", "SHOP.SHELF_PROXIMITY_EXITED",
            "SHOP.SHELF_REVISITED", "SHOP.CHECKOUT_PROXIMITY_ENTERED", "SHOP.CHECKOUT_PROXIMITY_EXITED",
            "SHOP.TARGET_PASSED", "SHOP.TARGET_SHELF_APPROACHED", "SHOP.TARGET_SHELF_REVISITED", "SHOP.WRONG_AISLE_ENTERED");
    private SourceEventDetails() {}

    public static ArrayNode build(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        var result = mapper.createArrayNode();
        var stations = RecordedStationIdentity.byEvent(mapper, input);
        for (var session : input.input().sessions()) for (var event : session.events()) {
            String code = event.action() == null ? null : event.action().eventCode();
            if (code != null && MOVEMENT_EVENTS.contains(code)) continue;
            var row = result.addObject();
            row.put("id", event.behaviorLogId().toString());
            row.put("sessionId", session.sessionId().toString());
            row.put("timeMs", event.elapsedFromSessionStartMs());
            row.put("sequence", event.sequence());
            if (code != null) row.put("eventCode", code);
            JsonNode source = mapper.valueToTree(event);
            if ("SHOP.STAFF_HELP_REQUESTED".equals(code) || "SHOP.GENERAL_HELP_OPENED".equals(code))
                copy(source.path("action"), "microActionId", row, "microActionId");
            copy(source, "sessionEnd", row, "sessionEnd");
            if ("SHOP.SESSION_STARTED".equals(code) || "SHOP.SESSION_ENDED".equals(code))
                copy(source.path("task"), "taskVersion", row, "collectorTaskVersion");
            var payload = source.path("payload");
            for (String field : VALUES) copy(payload, field, row, field);
            if (stations.containsKey(event.behaviorLogId().toString()))
                row.set("recordedStation", stations.get(event.behaviorLogId().toString()).deepCopy());
            copy(payload, "timing", row, "timing");
            copy(payload.path("marketContent"), "cart", row, "cart");
            copy(payload.path("marketContent"), "action", row, "recordedAction");
            copy(payload.path("marketContent"), "runtimeState", row, "runtimeState");
            copy(payload.path("marketContent"), "outcomeEvents", row, "runtimeOutcomeEvents");
            if ("SHOP.TIME_LIMIT_EXPIRED".equals(code)) {
                copy(payload.path("marketContent"), "missionSnapshot", row, "missionSnapshot");
                copy(payload.path("marketContent"), "objectiveProgress", row, "objectiveProgress");
            }
            // Preserve the selected SKU's recorded label and package unit, not the target family label.
            var item = payload.path("marketContent").path("item");
            if (item.isObject()) {
                var product = row.putObject("selectedProduct");
                for (String field : List.of("id", "name", "detail", "salesUnit", "attributes", "price"))
                    copy(item, field, product, field);
            }
            copy(payload.path("marketContent").path("sceneSnapshot").path("startingConditions"), "cart", row, "initialCart");
        }
        return result;
    }

    private static void copy(JsonNode from, String field, ObjectNode to, String target) {
        if (from.hasNonNull(field)) to.set(target, from.get(field).deepCopy());
    }
}
