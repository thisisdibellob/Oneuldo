package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.FinalSourceEncoding;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** One reversible dictionary across current evidence and prior plays; readable controls stay literal. */
final class AdaptiveQuestTransport {
    private static final String VERSION_FIELD="adaptiveTransportVersion";
    private static final String VERSION="shared-environment-v1";
    private static final List<String> LITERAL_FIELDS = List.of(
            "outputSchema", "readableActions", "policy", "timePolicy",
            "requiredDifficulty", "requiredItemCount", "allowedBehaviorEvidenceIds", "allowedMovementEvidenceIds",
            "candidate", "citedOriginalRecords", "literalChanges", "computedObjectiveCosts");
    private AdaptiveQuestTransport() {}

    static ObjectNode encode(ObjectMapper mapper, ObjectNode source) {
        if(source.has(VERSION_FIELD))throw new IllegalArgumentException("ADAPTIVE_TRANSPORT_METADATA_COLLISION");
        var facts = source.deepCopy();
        facts.remove(LITERAL_FIELDS);
        var packed = new FinalSourceEncoding(mapper).encode(facts);
        for (String field : LITERAL_FIELDS) if (source.has(field)) packed.set(field, source.get(field).deepCopy());
        packed.put(VERSION_FIELD,VERSION);
        return packed;
    }

    static ObjectNode decode(ObjectMapper mapper, JsonNode source) {
        var packed = (ObjectNode) source.deepCopy();
        boolean legacy=!packed.has(VERSION_FIELD);
        if(!legacy&&!VERSION.equals(packed.path(VERSION_FIELD).asString()))throw new IllegalArgumentException("UNKNOWN_ADAPTIVE_TRANSPORT_VERSION");
        packed.remove(VERSION_FIELD);
        packed.remove(LITERAL_FIELDS);
        if(legacy)packed.remove("currentEnvironment");
        var facts = new FinalSourceEncoding(mapper).decode(packed);
        for (String field : LITERAL_FIELDS) if (source.has(field)) facts.set(field, source.get(field).deepCopy());
        if(legacy&&source.has("currentEnvironment"))facts.set("currentEnvironment",source.get("currentEnvironment").deepCopy());
        return facts;
    }
}
