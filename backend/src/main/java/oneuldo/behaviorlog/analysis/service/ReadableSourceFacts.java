package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Small literal source pairs, without inferred understanding, matches, or verdicts. */
public final class ReadableSourceFacts {
    public static final String FIELD = "readableSourceFacts";
    private static final List<String> PRESENCE_CODES = List.of("SHOP.ITEM_SEARCH_STARTED", "SHOP.SHELF_PROXIMITY_ENTERED",
            "SHOP.SHELF_OPENED", "SHOP.QUANTITY_CHANGED", "SHOP.ITEM_REMOVED", "SHOP.CART_OPENED",
            "SHOP.GENERAL_HELP_OPENED", "SHOP.STAFF_HELP_REQUESTED", "SHOP.CHECKOUT_SUBMITTED");
    private ReadableSourceFacts() {}

    public static ObjectNode build(ObjectMapper mapper, ObjectNode source) {
        var facts = mapper.createObjectNode();
        var actions = facts.putObject("eventsById");
        var terminals = facts.putArray("terminalSnapshots");
        for (var event : source.path(SourceEventDetails.FIELD)) {
            String code = event.path("eventCode").asString();
            boolean terminal = Set.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED", "SHOP.SESSION_ENDED").contains(code);
            boolean action = event.has("selectedProduct") || Set.of("SHOP.QUANTITY_CHANGED", "SHOP.SHELF_OPENED", "SHOP.SHELF_CLOSED",
                    "SHOP.GENERAL_HELP_OPENED", "SHOP.STAFF_HELP_REQUESTED").contains(code);
            if (action && event.path("id").isString()) {
                var row = actions.putObject(event.path("id").asString());
                for (String field : List.of("sessionId", "sequence", "eventCode", "itemId", "stationId", "quantityBefore", "quantityAfter", "microActionId"))
                    scalar(event, field, row, field);
                scalar(event.path("selectedProduct"), "id", row, "recordedProductId");
                scalar(event.path("selectedProduct"), "detail", row, "recordedProductDetail");
                scalar(event.path("recordedAction"), "type", row, "recordedActionType");
                scalar(event.path("recordedAction"), "station", row, "recordedActionStation");
            }
            if (terminal) {
                var row = terminals.addObject();
                for (String field : List.of("id", "sessionId", "sequence", "eventCode", "cartTotalAmount", "budgetAmount")) scalar(event, field, row, field);
                if (event.path("cart") instanceof ObjectNode cart) {
                    var items = row.putArray("recordedCart");
                    for (String id : cart.propertyNames()) if (cart.get(id).isValueNode())
                        items.addObject().put("productId", id).set("quantity", cart.get(id).deepCopy());
                }
                var clock = primitiveObject(mapper, event.path("timing"));
                if (!clock.isEmpty()) row.set("timing", clock);
                scalar(event.path("sessionEnd"), "reason", row, "recordedEndReason");
            }
        }
        var requirements = facts.putArray("requirements");
        for (var task : source.path("taskContext")) {
            var row = requirements.addObject();
            scalar(task, "sessionId", row, "sessionId"); scalar(task, "sourceEventId", row, "sourceEventId");
            for (String field : List.of("budget", "timeLimitSeconds")) scalar(task.path("mission"), field, row, field);
            var goals = row.putArray("objectives");
            for (var objective : task.path("mission").path("objectives")) {
                var goal = goals.addObject();
                for (String field : List.of("productId", "quantity", "label", "quantityUnit")) scalar(objective, field, goal, field);
                if (objective.path("acceptedProductIds").isArray()
                        && java.util.stream.StreamSupport.stream(objective.path("acceptedProductIds").spliterator(), false).allMatch(JsonNode::isValueNode))
                    goal.set("acceptedProductIds", objective.get("acceptedProductIds").deepCopy());
            }
        }
        facts.put("scope", "기존 사건 ID와 그 사건의 원본 값만 짝지은 읽기 사본이다. 제출/초과/종료는 서로 다른 사건이다. 성패·일치·인지·지원 수준을 판정한 표가 아니며 새로운 인용 권한도 없다. 누락된 필드와 원본의 다른 값은 sourceEventDetails/taskContext에 보존한다. 각 문장의 상품·수량·매대·도움 조작을 같은 ID의 값과 대조한다.");
        addActionPresence(facts, source);
        return facts;
    }

    /** Counts only supplied event rows, never intentions, visits, mastery or a success score. */
    private static void addActionPresence(ObjectNode facts, ObjectNode source) {
        Map<String, Map<String, JsonNode>> sessions = new LinkedHashMap<>();
        for (var event : source.path(SourceEventDetails.FIELD)) addEvent(sessions, event, event.path("sessionId"));
        for (var session : source.path(MovementSourceContext.FIELD).path("sessions"))
            for (var event : session.path("movementEventDetails")) addEvent(sessions, event, session.path("sessionId"));
        var rows = facts.putArray("recordedActionPresence");
        sessions.forEach((id, events) -> {
            var row = rows.addObject().put("sessionId", id);
            row.put("sequenceCoverageComplete", events.values().stream().allMatch(e -> e.path("sequence").isIntegralNumber()));
            counts(row.putObject("providedEventCounts"), events, null);
            var after = row.putArray("afterGeneralHelp");
            for (var help : events.values()) if (help.path("eventCode").asString().equals("SHOP.GENERAL_HELP_OPENED")
                    && help.path("sequence").isIntegralNumber()) {
                var item = after.addObject();
                scalar(help, "id", item, "helpEventId"); scalar(help, "sequence", item, "helpSequence");
                counts(item.putObject("providedLaterEventCounts"), events, help.path("sequence").asLong());
            }
        });
        facts.put("actionPresenceScope", "Counts deduplicate supplied event IDs; zero means no matching event in supplied coverage, never hidden behavior/cognition. Before/after uses integer sequence only; sequenceCoverageComplete=false leaves unsequenced order unknown. ITEM_SEARCH_STARTED is a request, not arrival/exposure. Distinguish movement after help from opening/selection/quantity/submission. With no supplied change/remove event, empty final cart permits no invented add-then-remove hypothesis. Check raw IDs and sourceCoverage.");
    }

    private static void addEvent(Map<String, Map<String, JsonNode>> sessions, JsonNode event, JsonNode sessionId) {
        if (!sessionId.isString() || !event.path("id").isString() || !PRESENCE_CODES.contains(event.path("eventCode").asString())) return;
        sessions.computeIfAbsent(sessionId.asString(), key -> new LinkedHashMap<>()).putIfAbsent(event.path("id").asString(), event);
    }

    private static void counts(ObjectNode target, Map<String, JsonNode> events, Long afterSequence) {
        for (String code : PRESENCE_CODES) {
            long count = events.values().stream().filter(e -> e.path("eventCode").asString().equals(code))
                    .filter(e -> afterSequence == null || (e.path("sequence").isIntegralNumber() && e.path("sequence").asLong() > afterSequence)).count();
            target.put(code, Math.toIntExact(count));
        }
    }

    private static ObjectNode primitiveObject(ObjectMapper mapper, JsonNode source) {
        var result = mapper.createObjectNode();
        if (source instanceof ObjectNode object) for (String field : object.propertyNames()) scalar(object, field, result, field);
        return result;
    }

    private static void scalar(JsonNode source, String field, ObjectNode target, String name) {
        if (source.has(field) && source.get(field).isValueNode()) target.set(name, source.get(field).deepCopy());
    }
}
