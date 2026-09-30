package oneuldo.behaviorlog.profile.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import java.util.List;
import java.util.regex.Pattern;
import oneuldo.behaviorlog.analysis.service.ReviewEvidenceException;
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
    // Remove only standalone parenthesized reference annotations, never product IDs or quantities.
    private static final Pattern INLINE_CITATIONS = Pattern.compile(
            "[（(\\[]\\s*[ER][0-9]+(?:\\s*[,，;·]\\s*[ER][0-9]+)*\\s*[）)\\]]");
    private static final Set<String> PROSE = Set.of("summary", "observation", "interpretation",
            "suggestedSupport", "explanation", "uncertainties", "alternativeExplanations", "goal", "rationale");
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
        for (var id : events) add(id.toString(), "R" + (++number));
        number = 0;
        for (var id : sessions) add(id.toString(), "S" + (++number));
    }

    String encode(String json) {
        ObjectNode root = (ObjectNode) replace(cleanProse(mapper.readTree(json), ""));
        root.set("allowedEvidenceEventIds", mapper.valueToTree(originals.keySet().stream()
                .filter(alias -> alias.startsWith("R")).toList()));
        root.put("referenceEncoding", "R숫자는 이번 요청의 근거 사건, S숫자는 세션의 별칭이다. "
                + "evidenceEventIds에는 allowedEvidenceEventIds에 있는 R 별칭만 사용한다. "
                + "본문의 옛 E/R 번호는 이번 인용 번호와 다르다. 본문에 번호를 다시 쓰거나 복사하지 말고 "
                + "해당 finding/sessionAssessment의 evidenceEventIds 배열에 있는 R 번호에서 선택한다. UUID나 새 번호를 만들지 않는다.");
        return mapper.writeValueAsString(root);
    }

    AiUserProfileDraft read(String raw) {
        JsonNode root = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        int index = 0;
        for (var finding : root.path("findings")) restoreEvidence(finding, index++);
        cleanProse(root, "");
        return mapper.readerFor(AiUserProfileDraft.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .readValue(root);
    }

    private void restoreEvidence(JsonNode node, int findingIndex) {
        if (!(node.path("evidenceEventIds") instanceof ArrayNode ids)) return;
        for (int i = 0; i < ids.size(); i++) {
            String path = "/findings/" + findingIndex + "/evidenceEventIds/" + i;
            if (!ids.get(i).isString()) throw new ReviewEvidenceException("INVALID_EVENT_REFERENCE", path, List.of());
            String supplied = ids.get(i).asString();
            String original = supplied.startsWith("R") ? originals.get(supplied) : null;
            // A full UUID is also valid, but only when it is an allowed event in this request.
            if (original == null && aliases.getOrDefault(supplied, "").startsWith("R")) original = supplied;
            if (original == null) throw new ReviewEvidenceException("UNKNOWN_PROFILE_EVENT_REFERENCE", path,
                    List.of(supplied.matches("[A-Za-z]{1,8}[0-9]{1,9}|[0-9a-fA-F-]{36}") ? supplied : "<invalid-reference>"));
            ids.set(i, mapper.valueToTree(original));
        }
    }

    private JsonNode cleanProse(JsonNode node, String field) {
        if (node.isString() && PROSE.contains(field))
            return mapper.valueToTree(INLINE_CITATIONS.matcher(node.asString()).replaceAll("").strip());
        if (node instanceof ObjectNode object) {
            for (String name : new ArrayList<>(object.propertyNames())) object.set(name, cleanProse(object.get(name), name));
        } else if (node instanceof ArrayNode array) {
            for (int i = 0; i < array.size(); i++) array.set(i, cleanProse(array.get(i), field));
        }
        return node;
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
