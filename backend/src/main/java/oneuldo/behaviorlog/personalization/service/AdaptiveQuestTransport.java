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
    private static final String VERSION="shared-environment-v5";
    private static final String GENERATION_VERSION="shared-environment-v6-original-objects";
    private static final String GENERATION_COMPACT_VERSION="shared-environment-v7-exact-templates";
    private static final String GENERATION_BASE_VERSION="adaptiveGenerationBaseVersion";
    private static final String ACTION_ENCODING="readableActionEncoding";
    private static final String ID_REFERENCES="allowedIdReferences";
    private static final List<String> V1_LITERAL_FIELDS = List.of(
            "outputSchema", "readableActions", "policy", "timePolicy",
            "requiredDifficulty", "requiredItemCount", "allowedBehaviorEvidenceIds", "allowedMovementEvidenceIds",
            "candidate", "citedOriginalRecords", "literalChanges", "computedObjectiveCosts");
    private static final List<String> V4_LITERAL_FIELDS = V1_LITERAL_FIELDS.stream()
            .filter(field->!field.equals("allowedBehaviorEvidenceIds")&&!field.equals("allowedMovementEvidenceIds")).toList();
    private static final List<String> LITERAL_FIELDS = V4_LITERAL_FIELDS.stream().filter(field->!field.equals("citedOriginalRecords")).toList();
    private AdaptiveQuestTransport() {}

    /** Generation may share identical raw geometry/source objects before column encoding.
     * Ordinary observation/review transport and the global source codec remain unchanged.
     */
    static ObjectNode encodeGeneration(ObjectMapper mapper,ObjectNode source){
        var best=encode(mapper,source);int bestTokens=QwenTokenCounter.count(best.toString());
        var numerical=new AdaptiveNumericColumnText(mapper).encode(best);int numericalTokens=QwenTokenCounter.count(numerical.toString());
        if(numericalTokens<bestTokens){best=numerical;bestTokens=numericalTokens;}
        for(int minimum:List.of(8,12,16,20,24,48,72,128)){
            var originals=new AdaptiveOriginalObjectSharing(mapper,minimum).encode(source);
            if(!originals.has(AdaptiveOriginalObjectSharing.DICTIONARY))continue;
            var candidate=encode(mapper,originals);
            candidate.put(VERSION_FIELD,GENERATION_VERSION);
            candidate.put(AdaptiveOriginalObjectSharing.RULE_FIELD,AdaptiveOriginalObjectSharing.RULE);
            numerical=new AdaptiveNumericColumnText(mapper).encode(candidate);numericalTokens=QwenTokenCounter.count(numerical.toString());
            int tokens=QwenTokenCounter.count(candidate.toString());
            if(tokens<bestTokens){best=candidate;bestTokens=tokens;}
            if(numericalTokens<bestTokens){best=numerical;bestTokens=numericalTokens;}
        }
        if(List.of(GENERATION_BASE_VERSION,AdaptiveNumericFragments.FIELD,AdaptiveNumericFragments.RULE_FIELD,AdaptiveNumericFragments.SUFFIX_FIELD,
                AdaptiveObjectTuples.FIELD,AdaptiveObjectTuples.RULE_FIELD).stream().anyMatch(source::has))return best;
        var numbersSource=best.has(AdaptiveNumericColumnText.RULE_FIELD)?AdaptiveNumericColumnText.decode(mapper,best):best;
        var tuples=compactEnvelope(new AdaptiveObjectTuples(mapper).encode(best));
        int tupleTokens=QwenTokenCounter.count(tuples.toString());if(tupleTokens<bestTokens){best=tuples;bestTokens=tupleTokens;}
        for(boolean suffixes:List.of(false,true)){
            var fragments=new AdaptiveNumericFragments(mapper,suffixes).encode(numbersSource);
            fragments=compactEnvelope(new AdaptiveNumericColumnText(mapper).encode(fragments));
            int fragmentTokens=QwenTokenCounter.count(fragments.toString());
            if(fragmentTokens<bestTokens){best=fragments;bestTokens=fragmentTokens;}
            tuples=compactEnvelope(new AdaptiveObjectTuples(mapper).encode(fragments));tupleTokens=QwenTokenCounter.count(tuples.toString());
            if(tupleTokens<bestTokens){best=tuples;bestTokens=tupleTokens;}
        }
        return best;
    }

    /** Bounded observation transport search: no source selection and no numeric rounding. */
    static ObjectNode encodeObservation(ObjectMapper mapper,ObjectNode source) {
        var best=encode(mapper,source);int tokens=QwenTokenCounter.count(best.toString());
        var candidate=new AdaptiveNumericColumnText(mapper).encode(best);int required=QwenTokenCounter.count(candidate.toString());
        if(required<tokens){best=candidate;tokens=required;}
        var numbers=best.has(AdaptiveNumericColumnText.RULE_FIELD)?AdaptiveNumericColumnText.decode(mapper,best):best;
        for(boolean suffixes:List.of(false,true)) {
            candidate=compactEnvelope(new AdaptiveNumericColumnText(mapper).encode(new AdaptiveNumericFragments(mapper,suffixes).encode(numbers)));
            required=QwenTokenCounter.count(candidate.toString());if(required<tokens){best=candidate;tokens=required;}
        }
        return best;
    }

    private static ObjectNode compactEnvelope(ObjectNode value){
        if(!GENERATION_COMPACT_VERSION.equals(value.path(VERSION_FIELD).asString())&&
                (value.has(AdaptiveNumericFragments.RULE_FIELD)||value.has(AdaptiveObjectTuples.RULE_FIELD))){
            value.put(GENERATION_BASE_VERSION,value.path(VERSION_FIELD).asString());value.put(VERSION_FIELD,GENERATION_COMPACT_VERSION);
        }
        return value;
    }

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
        boolean compactGeneration=GENERATION_COMPACT_VERSION.equals(source.path(VERSION_FIELD).asString());
        if(compactGeneration){
            if(!List.of(VERSION,GENERATION_VERSION).contains(source.path(GENERATION_BASE_VERSION).asString())||
                    !source.has(AdaptiveObjectTuples.RULE_FIELD)&&!source.has(AdaptiveNumericFragments.RULE_FIELD))throw new IllegalArgumentException("INVALID_ADAPTIVE_GENERATION_TEMPLATES");
            if(source.has(AdaptiveObjectTuples.RULE_FIELD))source=AdaptiveObjectTuples.decode(mapper,(ObjectNode)source);
        }
        if(source.has(AdaptiveNumericColumnText.RULE_FIELD))source=AdaptiveNumericColumnText.decode(mapper,(ObjectNode)source);
        if(compactGeneration){
            if(source.has(AdaptiveNumericFragments.RULE_FIELD))source=AdaptiveNumericFragments.decode(mapper,(ObjectNode)source);
            var normalized=(ObjectNode)source.deepCopy();normalized.put(VERSION_FIELD,normalized.path(GENERATION_BASE_VERSION).asString());normalized.remove(GENERATION_BASE_VERSION);source=normalized;
        }
        boolean sharedOriginals=GENERATION_VERSION.equals(source.path(VERSION_FIELD).asString());
        if(sharedOriginals){
            if(!AdaptiveOriginalObjectSharing.RULE.equals(source.path(AdaptiveOriginalObjectSharing.RULE_FIELD).asString()))throw new IllegalArgumentException("INVALID_ADAPTIVE_ORIGINAL_OBJECT_RULE");
            var normalized=(ObjectNode)source.deepCopy();normalized.remove(AdaptiveOriginalObjectSharing.RULE_FIELD);normalized.put(VERSION_FIELD,VERSION);source=normalized;
        }
        var packed = (ObjectNode) source.deepCopy();
        boolean legacy=!packed.has(VERSION_FIELD);
        String version=packed.path(VERSION_FIELD).asString();
        if(!legacy&&!List.of(VERSION,"shared-environment-v4","shared-environment-v3","shared-environment-v2","shared-environment-v1").contains(version))throw new IllegalArgumentException("UNKNOWN_ADAPTIVE_TRANSPORT_VERSION");
        var literalFields=VERSION.equals(version)?LITERAL_FIELDS:List.of("shared-environment-v4","shared-environment-v3","shared-environment-v2").contains(version)?V4_LITERAL_FIELDS:V1_LITERAL_FIELDS;
        var references=packed.has(ID_REFERENCES)?packed.get(ID_REFERENCES).deepCopy():mapper.createObjectNode();
        if(!references.isObject()||!references.isEmpty()&&!List.of(VERSION,"shared-environment-v4").contains(version))throw new IllegalArgumentException("UNKNOWN_ALLOWED_ID_REFERENCE");
        packed.remove(java.util.List.of(ID_REFERENCES,"allowedIdReferenceRules"));
        boolean actionsPacked=packed.has(ACTION_ENCODING);
        if(actionsPacked&&(!List.of(VERSION,"shared-environment-v4","shared-environment-v3").contains(version)||!packed.path(ACTION_ENCODING).asString().startsWith("lossless-row-columns-v1:")))throw new IllegalArgumentException("UNKNOWN_READABLE_ACTION_ENCODING");
        packed.remove(ACTION_ENCODING);
        packed.remove(VERSION_FIELD);
        packed.remove(literalFields);
        if(legacy)packed.remove("currentEnvironment");
        var facts = new FinalSourceEncoding(mapper).decode(packed);
        for (String field : literalFields) if (source.has(field)) facts.set(field, source.get(field).deepCopy());
        if(actionsPacked)facts.set("readableActions",new LosslessEventColumns(mapper).decodeValues(source.path("readableActions")));
        if(sharedOriginals)facts=AdaptiveOriginalObjectSharing.decode(mapper,facts);
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
