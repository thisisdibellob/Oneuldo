package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.FinalSourceEncoding;
import oneuldo.behaviorlog.analysis.service.LosslessEventColumns;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** One reversible dictionary across current evidence and prior plays; readable controls stay literal. */
final class AdaptiveQuestTransport {
    private static final String VERSION_FIELD="adaptiveTransportVersion";
    private static final String VERSION="shared-environment-v4";
    private static final String ACTION_ENCODING="readableActionEncoding";
    private static final String ID_REFERENCES="allowedIdReferences";
    private static final List<String> V1_LITERAL_FIELDS = List.of(
            "outputSchema", "readableActions", "policy", "timePolicy",
            "requiredDifficulty", "requiredItemCount", "allowedBehaviorEvidenceIds", "allowedMovementEvidenceIds",
            "candidate", "citedOriginalRecords", "literalChanges", "computedObjectiveCosts");
    private static final List<String> LITERAL_FIELDS = V1_LITERAL_FIELDS.stream()
            .filter(field->!field.equals("allowedBehaviorEvidenceIds")&&!field.equals("allowedMovementEvidenceIds")).toList();
    private AdaptiveQuestTransport() {}

    static ObjectNode encode(ObjectMapper mapper, ObjectNode source) {
        if(source.has(VERSION_FIELD)||source.has(ACTION_ENCODING)||source.has(ID_REFERENCES))throw new IllegalArgumentException("ADAPTIVE_TRANSPORT_METADATA_COLLISION");
        var facts = source.deepCopy();
        facts.remove(LITERAL_FIELDS);
        var references=mapper.createObjectNode();
        for(String field:List.of("allowedBehaviorEvidenceIds","allowedMovementEvidenceIds")){
            boolean movement=field.equals("allowedMovementEvidenceIds");
            var ids=sourceIds(mapper,source.path("recordedEvidence"),movement);
            if(ids.size()>=20&&ids.equals(source.path(field))){
                facts.set(field,mapper.createObjectNode().put("from","recordedEvidence").put("selection",movement?"MOVEMENT_SOURCE_IDS":"INTERACTION_SOURCE_IDS").put("count",ids.size()));
                references.put(field,movement);
            }
        }
        var packed = new FinalSourceEncoding(mapper,true).encode(facts);
        for (String field : LITERAL_FIELDS) if (source.has(field)) packed.set(field, source.get(field).deepCopy());
        if(source.path("readableActions").isArray()&&source.path("readableActions").size()>2){
            var rows=new java.util.ArrayList<JsonNode>();source.path("readableActions").forEach(rows::add);
            var table=new LosslessEventColumns(mapper).encodeValues(rows);
            String rule="lossless-row-columns-v1: readableActions.count/data expands the exact original ordered [id,eventCode,timeMs,itemId,quantityBefore,quantityAfter,actionType,stationId] rows. same=common literal, values=per-row, dictionary/refs=0-based original values, fields/rest=object columns, groups/positions=original positions, items=array-position columns, prefix/suffixes=exact concatenation. Use matching row IDs; no facts, order or numeric values change.";
            if(QwenTokenCounter.count(table.toString())+QwenTokenCounter.count(rule)<QwenTokenCounter.count(source.path("readableActions").toString())){
                packed.set("readableActions",table);packed.put(ACTION_ENCODING,rule);
            }
        }
        if(!references.isEmpty()){
            packed.set(ID_REFERENCES,references);
            packed.put("allowedIdReferenceRules","Referenced allowed ID lists expand from recordedEvidence in numeric E order. INTERACTION_SOURCE_IDS=sourceEventDetails[].id. MOVEMENT_SOURCE_IDS=events row[0] with movement/shelf/route/proximity/target/aisle codes, SHELF sourceEventDetails[].id, navigationContext.sessions[].movementEventDetails[].id and sceneSources/collectorContexts[].sourceEventId. Use actual same-ID originals; never invent ranges. No IDs are removed or added.");
        }
        packed.put(VERSION_FIELD,VERSION);
        return packed;
    }

    static ObjectNode decode(ObjectMapper mapper, JsonNode source) {
        var packed = (ObjectNode) source.deepCopy();
        boolean legacy=!packed.has(VERSION_FIELD);
        String version=packed.path(VERSION_FIELD).asString();
        if(!legacy&&!List.of(VERSION,"shared-environment-v3","shared-environment-v2","shared-environment-v1").contains(version))throw new IllegalArgumentException("UNKNOWN_ADAPTIVE_TRANSPORT_VERSION");
        var literalFields=List.of(VERSION,"shared-environment-v3","shared-environment-v2").contains(version)?LITERAL_FIELDS:V1_LITERAL_FIELDS;
        var references=packed.has(ID_REFERENCES)?packed.get(ID_REFERENCES).deepCopy():mapper.createObjectNode();
        if(!references.isObject()||!references.isEmpty()&&!VERSION.equals(version))throw new IllegalArgumentException("UNKNOWN_ALLOWED_ID_REFERENCE");
        packed.remove(java.util.List.of(ID_REFERENCES,"allowedIdReferenceRules"));
        boolean actionsPacked=packed.has(ACTION_ENCODING);
        if(actionsPacked&&(!List.of(VERSION,"shared-environment-v3").contains(version)||!packed.path(ACTION_ENCODING).asString().startsWith("lossless-row-columns-v1:")))throw new IllegalArgumentException("UNKNOWN_READABLE_ACTION_ENCODING");
        packed.remove(ACTION_ENCODING);
        packed.remove(VERSION_FIELD);
        packed.remove(literalFields);
        if(legacy)packed.remove("currentEnvironment");
        var facts = new FinalSourceEncoding(mapper).decode(packed);
        for (String field : literalFields) if (source.has(field)) facts.set(field, source.get(field).deepCopy());
        if(actionsPacked)facts.set("readableActions",new LosslessEventColumns(mapper).decodeValues(source.path("readableActions")));
        for(String field:references.propertyNames()){
            if(!List.of("allowedBehaviorEvidenceIds","allowedMovementEvidenceIds").contains(field)||!references.get(field).isBoolean())throw new IllegalArgumentException("INVALID_ALLOWED_ID_REFERENCE");
            boolean movement=references.get(field).asBoolean();var value=facts.path(field);
            if(!"recordedEvidence".equals(value.path("from").asString())||!(movement?"MOVEMENT_SOURCE_IDS":"INTERACTION_SOURCE_IDS").equals(value.path("selection").asString()))throw new IllegalArgumentException("INVALID_ALLOWED_ID_REFERENCE");
            var ids=sourceIds(mapper,facts.path("recordedEvidence"),movement);
            if(ids.size()!=value.path("count").asInt(-1))throw new IllegalArgumentException("INVALID_ALLOWED_ID_REFERENCE_COUNT");
            facts.set(field,ids);
        }
        if(legacy&&source.has("currentEnvironment"))facts.set("currentEnvironment",source.get("currentEnvironment").deepCopy());
        return facts;
    }
    private static tools.jackson.databind.node.ArrayNode sourceIds(ObjectMapper mapper,JsonNode evidence,boolean movement){
        var ids=movement?AdaptiveQuestEvidence.ids(evidence,true):new java.util.HashSet<String>();
        if(!movement)evidence.path("sourceEventDetails").forEach(row->ids.add(row.path("id").asString()));
        var result=mapper.createArrayNode();
        if(ids.stream().anyMatch(id->!id.matches("E[1-9][0-9]*")))return result;
        ids.stream().sorted(java.util.Comparator.comparingInt(id->Integer.parseInt(id.substring(1)))).forEach(result::add);
        return result;
    }
}
