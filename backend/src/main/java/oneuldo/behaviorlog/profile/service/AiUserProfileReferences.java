package oneuldo.behaviorlog.profile.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import oneuldo.behaviorlog.profile.domain.AiUserProfileDraft;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Short, run-scoped aliases prevent the model from copying long evidence UUIDs incorrectly. */
final class AiUserProfileReferences {
    private final ObjectMapper mapper;
    private final Map<String, String> aliases = new LinkedHashMap<>();
    private final Map<String, String> originals = new LinkedHashMap<>();

    AiUserProfileReferences(ObjectMapper mapper, AiUserProfile previous, AiBehaviorAnalysisResponse current) {
        this.mapper = mapper;
        var events = new LinkedHashSet<UUID>();
        var sessions = new LinkedHashSet<UUID>();
        collect(previous.getProfile(), events, sessions);
        collect(current.analysis(), events, sessions);
        int number = 0;
        for (var id : events) add(id.toString(), "E" + (++number));
        number = 0;
        for (var id : sessions) add(id.toString(), "S" + (++number));
    }

    String encode(String json) {
        ObjectNode root = (ObjectNode) replace(mapper.readTree(json));
        root.put("referenceEncoding", "E숫자는 제공된 근거 사건, S숫자는 제공된 세션의 별칭이다. "
                + "evidenceEventIds에는 제공된 E 별칭만 그대로 사용하고 UUID를 만들거나 수정하지 않는다.");
        return mapper.writeValueAsString(root);
    }

    AiUserProfileDraft read(String raw) {
        JsonNode root = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        for (var finding : root.path("findings")) restoreEvidence(finding);
        return mapper.readerFor(AiUserProfileDraft.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .readValue(root);
    }

    private void restoreEvidence(JsonNode node) {
        if (!(node.path("evidenceEventIds") instanceof ArrayNode ids)) return;
        for (int i = 0; i < ids.size(); i++) {
            if (!ids.get(i).isString()) throw new IllegalArgumentException("INVALID_EVENT_REFERENCE");
            String original = originals.get(ids.get(i).asString());
            if (original == null || !ids.get(i).asString().startsWith("E"))
                throw new IllegalArgumentException("UNKNOWN_PROFILE_EVENT_REFERENCE");
            ids.set(i, mapper.valueToTree(original));
        }
    }

    private JsonNode replace(JsonNode node) {
        if (node.isString()) return aliases.containsKey(node.asString())
                ? mapper.valueToTree(aliases.get(node.asString())) : node;
        if (node instanceof ObjectNode object) {
            for (String name : new ArrayList<>(object.propertyNames())) object.set(name, replace(object.get(name)));
        } else if (node instanceof ArrayNode array) {
            for (int i = 0; i < array.size(); i++) array.set(i, replace(array.get(i)));
        }
        return node;
    }

    private void add(String original, String alias) {
        if (aliases.putIfAbsent(original, alias) == null) originals.put(alias, original);
    }

    private static void collect(AiBehaviorAnalysis analysis, LinkedHashSet<UUID> events,
            LinkedHashSet<UUID> sessions) {
        analysis.findings().forEach(finding -> events.addAll(finding.evidenceEventIds()));
        analysis.sessionAssessments().forEach(assessment -> {
            sessions.add(assessment.sessionId());
            events.addAll(assessment.evidenceEventIds());
        });
    }
}
