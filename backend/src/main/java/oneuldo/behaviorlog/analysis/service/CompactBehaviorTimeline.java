package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Reversible wire encoding only. Never samples, scores, sorts or drops events. */
public final class CompactBehaviorTimeline {
    public static final String ENCODER_REVISION = "context-sharing-v2";
    public static final String FORMAT = "behavior-timeline-compact-v1";
    private static final List<String> CONTEXT_FIELDS = List.of("eventSchemaVersion", "appVersion", "contentVersion",
            "offlineQueued", "devicePerformanceClass", "task", "accessibility", "simulation");
    private static final List<String> PAYLOAD_CONTEXT = List.of("type", "catalogVersion", "scenarioId", "scenarioVersion");
    private static final List<String> MOVEMENT_FIELDS = List.of("behaviorLogId", "sequence", "elapsedFromSessionStartMs",
            "occurredAt", "receivedAt", "contextRef");
    private static final List<String> POSITION_FIELDS = List.of("x", "y", "blocked", "controlMode");
    private final ObjectMapper mapper;

    public CompactBehaviorTimeline(ObjectMapper mapper) { this.mapper = mapper; }

    public ObjectNode encode(ObjectNode source) {
        ObjectNode result = source.deepCopy();
        stripNulls(result);
        result.put("encoding", FORMAT);
        result.set("movementColumns", mapper.valueToTree(List.of("kind=M", "behaviorLogId", "sequence",
                "elapsedFromSessionStartMs", "occurredAt", "receivedAt", "contextRef", "x", "y", "blocked", "controlMode", "detail")));
        result.put("encodingRules", "events는 원본 순서다. events의 객체는 일반 사건, 배열은 movementColumns 순서의 이동 사건이다. "
                + "배열 한 행도 실제 사건 하나이며 생략된 이동은 없다. contextRef는 같은 세션의 contexts 전체 문맥을 참조한다. "
                + "문맥은 앞 사건에서 상속하지 않는다. context와 사건(detail 포함)을 객체별로 합쳐 읽는다. "
                + "이동 배열의 eventCode는 SHOP.MOVEMENT_SAMPLED이며 detail의 나머지 속성도 모두 관측 자료다. "
                + "객체에서 생략한 null 필드는 미기록/알 수 없음이며 false나 0이 아니다. 배열의 null도 미기록이다. "
                + "0,false,빈 문자열,빈 배열,빈 객체는 유지한다. 근거에는 제공된 사건 ID를 쓴다.");
        for (var sessionNode : result.path("sessions")) {
            ObjectNode session = (ObjectNode) sessionNode;
            ObjectNode contexts = mapper.createObjectNode();
            Map<JsonNode, String> contextIds = new LinkedHashMap<>();
            ArrayNode encoded = mapper.createArrayNode();
            for (var eventNode : session.path("events")) {
                ObjectNode event = (ObjectNode) eventNode;
                ObjectNode context = mapper.createObjectNode();
                moveFields(event, context, CONTEXT_FIELDS);
                extractSection(event, context, "presentation", List.of("screenId", "instructionContentId"));
                extractSection(event, context, "payload", PAYLOAD_CONTEXT);
                if (event.path("payload") instanceof ObjectNode payload && payload.path("marketContent") instanceof ObjectNode content) {
                    ObjectNode shared = mapper.createObjectNode();
                    moveFields(content, shared, List.of("sceneRef", "layoutVersion", "seed", "movementContext", "agentContext", "controlSource", "replayExecutionContext"));
                    if (!shared.isEmpty()) object(context, "payload").set("marketContent", shared);
                }
                String ref = contextIds.get(context);
                if (ref == null) {
                    ref = "C" + (contextIds.size() + 1);
                    contextIds.put(context, ref);
                    contexts.set(ref, context);
                }
                event.put("contextRef", ref);
                if ("SHOP.MOVEMENT_SAMPLED".equals(event.path("action").path("eventCode").asString())
                        && event.path("payload") instanceof ObjectNode) {
                    ArrayNode row = mapper.createArrayNode().add("M");
                    for (String key : MOVEMENT_FIELDS) row.add(event.remove(key));
                    ObjectNode payload = object(event, "payload");
                    for (String key : POSITION_FIELDS) row.add(payload.remove(key));
                    ((ObjectNode) event.path("action")).remove("eventCode");
                    row.add(event);
                    encoded.add(row);
                } else encoded.add(event);
            }
            session.set("contexts", contexts);
            session.set("events", encoded);
        }
        return result;
    }

    /** Expand for audits/tests; semantic equality is checked after the documented null omission. */
    public ObjectNode decode(JsonNode compact) {
        return decodeExpanded(compact);
    }
    /** Decode an explicitly table-encoded prompt timeline; do not use for the plain encode() result. */
    public ObjectNode decodeWithTables(JsonNode compact) {
        return decodeExpanded(new LosslessTables(mapper).decode(compact));
    }
    /** Use after the enclosing prompt's table layer has already been decoded. */
    public ObjectNode decodeExpanded(JsonNode compact) {
        if ("event-groups-v1".equals(compact.path("encoding").asString()))
            return new GroupedEventInput(mapper).decode((ObjectNode)compact);
        if (LosslessEventColumns.FORMAT.equals(compact.path("encoding").asString()))
            return new LosslessEventColumns(mapper).decode(compact);
        ObjectNode result = ((ObjectNode) compact).deepCopy();
        if (!FORMAT.equals(result.path("encoding").asString())) throw new IllegalArgumentException("Unknown timeline encoding");
        result.remove(List.of("encoding", "movementColumns", "encodingRules"));
        for (var sessionNode : result.path("sessions")) {
            ObjectNode session = (ObjectNode) sessionNode;
            JsonNode contexts = session.remove("contexts");
            ArrayNode events = mapper.createArrayNode();
            for (var encoded : session.path("events")) {
                ObjectNode event;
                if (encoded.isArray()) {
                    if (encoded.size() != 12 || !"M".equals(encoded.get(0).asString())) throw new IllegalArgumentException("Invalid movement row");
                    event = ((ObjectNode) encoded.get(11)).deepCopy();
                    for (int i = 0; i < MOVEMENT_FIELDS.size(); i++) if (!encoded.get(i + 1).isNull()) event.set(MOVEMENT_FIELDS.get(i), encoded.get(i + 1));
                    ObjectNode payload = object(event, "payload");
                    for (int i = 0; i < POSITION_FIELDS.size(); i++) if (!encoded.get(i + 7).isNull()) payload.set(POSITION_FIELDS.get(i), encoded.get(i + 7));
                    object(event, "action").put("eventCode", "SHOP.MOVEMENT_SAMPLED");
                } else event = ((ObjectNode) encoded).deepCopy();
                String ref = event.remove("contextRef").asString();
                if (!(contexts.path(ref) instanceof ObjectNode shared)) throw new IllegalArgumentException("Unknown context reference");
                ObjectNode restored = shared.deepCopy();
                merge(restored, event);
                events.add(restored);
            }
            session.set("events", events);
        }
        return result;
    }

    public static void stripNulls(JsonNode node) {
        if (node instanceof ObjectNode object) {
            for (String key : new ArrayList<>(object.propertyNames())) {
                if (object.get(key).isNull()) object.remove(key);
                else stripNulls(object.get(key));
            }
        } else if (node.isArray()) node.forEach(CompactBehaviorTimeline::stripNulls);
    }
    private void extractSection(ObjectNode event, ObjectNode context, String section, List<String> fields) {
        if (!(event.path(section) instanceof ObjectNode child)) return;
        ObjectNode shared = mapper.createObjectNode();
        moveFields(child, shared, fields);
        if (!shared.isEmpty()) context.set(section, shared);
    }
    private static void moveFields(ObjectNode source, ObjectNode target, List<String> fields) {
        for (String key : fields) { JsonNode value = source.remove(key); if (value != null) target.set(key, value); }
    }
    private ObjectNode object(ObjectNode parent, String key) {
        if (parent.path(key) instanceof ObjectNode child) return child;
        ObjectNode child = mapper.createObjectNode(); parent.set(key, child); return child;
    }
    private void merge(ObjectNode target, ObjectNode detail) {
        for (String key : detail.propertyNames()) {
            if (target.path(key) instanceof ObjectNode left && detail.get(key) instanceof ObjectNode right) merge(left, right);
            else target.set(key, detail.get(key));
        }
    }
}
