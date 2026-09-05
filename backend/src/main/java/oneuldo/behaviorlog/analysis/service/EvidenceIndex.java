package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Curated, versioned index. Candidate status alone never authorizes model use. */
@Component
public class EvidenceIndex {
    public static final String VERSION = "evidence-review-2026-09-05-v1";
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final JsonNode CANDIDATES = read("candidates.json");
    private static final JsonNode REVIEW = read("review.json");
    public static List<JsonNode> retrieve(String context) {
        // Current approved scope is general interface accessibility, not individual diagnosis.
        if (context == null || context.isBlank()) return List.of();
        Set<String> allowed = new HashSet<>();
        REVIEW.path("cards").forEach(r -> {
            if ("DEVELOPMENT_APPROVED".equals(r.path("status").asString())
                    && "interface_support_only".equals(r.path("scope").asString())) allowed.add(r.path("cardId").asString());
        });
        List<JsonNode> result = new ArrayList<>();
        CANDIDATES.forEach(card -> {
            if (allowed.contains(card.path("card_id").asString())
                    && "open_reuse_with_conditions".equals(card.path("rights").path("status").asString())
                    && !card.path("contains_real_user_data").asBoolean()
                    && !card.path("source_url").asString().isBlank()
                    && !card.path("caution_ko").asString().isBlank()) result.add(card.deepCopy());
        });
        return List.copyOf(result);
    }
    public static void validateCitations(List<String> ids, String context) {
        var allowed = retrieve(context).stream().map(c -> c.path("card_id").asString()).toList();
        if (ids != null && (ids.size() > 8 || !allowed.containsAll(ids) || new HashSet<>(ids).size() != ids.size()))
            throw new IllegalArgumentException("UNAVAILABLE_EVIDENCE_CITATION");
    }
    private static JsonNode read(String file) {
        try (var stream = EvidenceIndex.class.getResourceAsStream("/evidence/" + file)) {
            if (stream == null) throw new IllegalStateException("MISSING_EVIDENCE_INDEX");
            return MAPPER.readTree(stream);
        } catch (java.io.IOException failure) { throw new IllegalStateException(failure); }
    }
}

