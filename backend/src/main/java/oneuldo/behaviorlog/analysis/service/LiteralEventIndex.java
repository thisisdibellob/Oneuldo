package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Literal identity/order/ownership lookup. Adds no outcome, cause, duration or ability judgment. */
public final class LiteralEventIndex {
    public static final String FIELD = "literalEventIndex";
    private LiteralEventIndex() {}

    public static ObjectNode build(ObjectMapper mapper, JsonNode source) {
        var result = mapper.createObjectNode();
        var rows = result.putObject("eventsById");
        for (var event : source.path(SourceEventDetails.FIELD)) {
            if (!event.path("id").isString()) continue;
            var row = rows.putObject(event.path("id").asString());
            for (String field : List.of("sessionId", "sequence", "timeMs", "eventCode"))
                scalar(event, field, row, field);
            scalar(event.path("replayExecutionContext"), "executionOwner", row, "recordedExecutionOwner");
            scalar(event.path("sessionEnd"), "reason", row, "recordedEndReason");
        }
        var coverage = result.putArray("movementSampleCoverage");
        for (var session : source.path(MovementSourceContext.FIELD).path("sessions")) {
            if (!session.has("providedPositionSampleEventCount")) continue;
            var row = coverage.addObject();
            scalar(session, "sessionId", row, "sessionId");
            scalar(session, "providedPositionSampleEventCount", row, "providedPositionSampleEventCount");
        }
        result.put("rule", "Literal source copy, not model observations. Use each actual E key, sequence and timeMs together; never renumber rows as E1,E2,... . "
                + "Compare order with the same session's original sequence/timeMs. A row/table position is not a time or an event ID. "
                + "This interaction lookup omits movement rows; their exact originals remain in behaviorTimeline/sourceMovementContext. Sample counts are recorded samples, not moves or cognition. "
                + "Missing ownership stays unknown. PERSONA_ACTOR and SYSTEM_COMPLETION/SYSTEM_STOP are recorded execution contexts, not proof of a human, independence or intent.");
        return result;
    }

    private static void scalar(JsonNode from, String name, ObjectNode to, String target) {
        if (from.has(name) && from.get(name).isValueNode()) to.set(target, from.get(name).deepCopy());
    }
}
