package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Only station kinds recorded at or before an event; never today's registry or an event-name guess. */
public final class RecordedStationIdentity {
    private RecordedStationIdentity() {}
    public static Map<String, ObjectNode> byEvent(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        Map<String, ObjectNode> result = new LinkedHashMap<>();
        for (var session : input.input().sessions()) {
            Map<String, ObjectNode> registry = new LinkedHashMap<>();
            for (var event : session.events()) {
                var payload = mapper.valueToTree(event).path("payload");
                var geometry = payload.path("marketContent").path("sceneSnapshot").path("startingConditions").path("geometry");
                if (geometry.isString()) {
                    try { geometry = mapper.readTree(geometry.asString()); }
                    catch (RuntimeException ignored) { geometry = mapper.missingNode(); }
                }
                if (geometry.isObject()) {
                    registry.clear(); // A new recorded snapshot replaces the previous registry, including missing kinds.
                    for (var station : geometry.path("stationDetails")) {
                        if (!station.path("id").isString() || !station.path("kind").isString()) continue;
                        var value = mapper.createObjectNode().put("stationId", station.path("id").asString())
                                .put("kind", station.path("kind").asString()).put("sourceEventId", event.behaviorLogId().toString());
                        for (String field : List.of("name", "label", "categoryId"))
                            if (station.has(field)) value.set(field, station.get(field).deepCopy());
                        registry.put(station.path("id").asString(), value);
                    }
                }
                if (!payload.path("stationId").isString()) continue;
                String id = payload.path("stationId").asString();
                var identity = registry.containsKey(id) ? registry.get(id).deepCopy()
                        : mapper.createObjectNode().put("stationId", id).put("kind", "UNKNOWN");
                result.put(event.behaviorLogId().toString(), identity);
            }
        }
        return Map.copyOf(result);
    }
}
