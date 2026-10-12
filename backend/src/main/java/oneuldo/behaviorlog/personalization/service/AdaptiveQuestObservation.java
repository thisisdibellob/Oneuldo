package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.ai.exception.AiInputLimitException;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Budget-bounded views of every raw position, retaining the complete interaction/map context. */
final class AdaptiveQuestObservation {
    static final int OUTPUT_TOKENS = 1200;
    record Part(ObjectNode source, String prompt, int requiredTokens) {}
    private AdaptiveQuestObservation() {}

    static List<Part> plan(ObjectMapper mapper, ObjectNode evidence, JsonNode readableActions, int budget) {
        var rows = new ArrayList<JsonNode>(); evidence.path("events").forEach(rows::add);
        int largest = 0;
        // Reserve one synthesis, two candidates and two reviews and bounded observation repairs independently of source size.
        int maximumParts = Math.max(1, AdaptiveQuestContract.MAXIMUM_AI_CALLS - 5 - AdaptiveObservationRequests.REPAIR_CALLS);
        for (int count = 1; count <= maximumParts; count++) {
            if (count > 1 && rows.size() < count) break;
            var parts = new ArrayList<Part>(); boolean fits = true; largest = 0;
            for (int part = 0; part < count; part++) {
                int start = rows.size() * part / count, end = rows.size() * (part + 1) / count;
                var source = evidence.deepCopy(); var selected = source.putArray("events");
                rows.subList(start, end).forEach(selected::add);
                source.putObject("movementObservationScope").put("part", part + 1).put("parts", count)
                        .put("originalRawPositionRowCount", rows.size()).put("providedRawPositionRowCount", end - start)
                        .put("scope", "These are original position rows in original order; every row occurs once across the parts. Full original interactions, navigation transitions and geometry are retained for temporal grounding. Unprovided positions in this part are in the other parts and immutable dataset; do not infer a whole route from this part alone.");
                // Include this exact ID/action table in the same reversible columns/dictionary,
                // rather than appending a second unencoded copy after the source is packed.
                source.set("readableActions", readableActions);
                var wire = AdaptiveQuestEvidence.encode(mapper, source);
                String prompt = mapper.writeValueAsString(wire);
                int required = QwenTokenCounter.inputTokens(AdaptiveMarketQuestService.OBSERVATION_SYSTEM, prompt) + OUTPUT_TOKENS + 32 + AdaptiveObservationRequests.REPAIR_RESERVE_TOKENS;
                largest = Math.max(largest, required);
                parts.add(new Part(source, prompt, required));
                // Reject this partition as soon as one request exceeds the budget.
                // A later partition is still built from the entire immutable source.
                if (required > budget) { fits = false; break; }
            }
            if (fits) return List.copyOf(parts);
        }
        throw new AiInputLimitException("ADAPTIVE_OBSERVATION_EXCEEDS_BOUNDED_PARTS", largest, budget);
    }
}
