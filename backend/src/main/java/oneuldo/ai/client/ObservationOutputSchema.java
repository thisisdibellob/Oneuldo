package oneuldo.ai.client;

import java.util.List;
import java.util.Map;

/** Fixed, bounded schema shared with the gateway. Reference membership is still validated after generation. */
public final class ObservationOutputSchema {
    private ObservationOutputSchema() {}
    private static final Map<String, Object> TEXT = Map.of("type", "string", "minLength", 1);
    private static Map<String, Object> array(Object items, int min, int max) {
        return Map.of("type", "array", "items", items, "minItems", min, "maxItems", max);
    }
    private static Map<String, Object> object(Map<String, Object> properties) {
        var ordered = new java.util.LinkedHashMap<String, Object>();
        for (String key : List.of("summary", "observations", "observation", "interpretation",
                "alternativeExplanations", "evidenceEventIds", "uncertainties", "requestedSegmentIds"))
            if (properties.containsKey(key)) ordered.put(key, properties.get(key));
        return Map.of("type", "object", "properties", java.util.Collections.unmodifiableMap(ordered),
                "required", List.copyOf(ordered.keySet()), "additionalProperties", false);
    }
    private static final Map<String, Object> REFERENCE = Map.of("type", "string", "pattern", "^E[1-9][0-9]*$");
    /** Accept legacy callers during a gateway-first rolling upgrade. */
    public static final Map<String, Object> LEGACY_VALUE = schema(1);
    public static final Map<String, Object> VALUE = schema(0);
    private static Map<String, Object> schema(int minimumAlternatives) { return object(Map.of(
            "summary", TEXT,
            "observations", array(object(Map.of(
                    "observation", TEXT, "interpretation", TEXT,
                    "alternativeExplanations", array(TEXT, minimumAlternatives, 8),
                    "evidenceEventIds", array(REFERENCE, 1, 30))), 0, 6),
            "uncertainties", array(TEXT, 0, 12),
            "requestedSegmentIds", array(REFERENCE, 0, 8))); }
}
