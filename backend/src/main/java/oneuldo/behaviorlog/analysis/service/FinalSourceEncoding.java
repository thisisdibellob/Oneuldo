package oneuldo.behaviorlog.analysis.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Reversible final transport only. Every original source value and citation row survives decoding. */
public final class FinalSourceEncoding {
    public static final String VERSION = "final-source-v2";
    public static final String ENCODER_REVISION = "shared-source-text-v2-source-event-set";
    private static final String VERSION_FIELD = "finalSourceEncodingVersion";
    private static final String RULE_FIELD = "finalSourceEncoding";
    private static final String COLUMNS = "$finalColumns";
    private static final String LITERAL = "$finalLiteral";
    private static final String EVENT_VIEW = "$finalEventView";
    private static final Set<String> RESERVED = Set.of(VERSION_FIELD, RULE_FIELD, COLUMNS, LITERAL, EVENT_VIEW);
    private static final List<String> EVENT_FIELDS = List.of("id", "sessionId", "timeMs", "eventCode");
    private static final String LEGACY_RULE = "{$finalColumns:{count,data}}는 count개 원본 행을 원래 순서대로 복원하는 무손실 표현이다. "
            + "data의 same은 모든 행의 동일 원문, values는 행별 원문, fields는 속성별 열, rest는 행별 나머지 속성이다. "
            + "dictionary/refs는 0기준 원문 참조, groups/positions는 0기준 원래 행 위치, prefix/suffixes는 그대로 이어 붙인 원문, items는 같은 길이 배열의 위치별 열이다. "
            + "빈 값·0·false·null·누락을 구별하며 사건·판정·수치는 생략하거나 바꾸지 않는다. $finalLiteral은 예약 키가 있는 원래 객체다. "
            + "evidenceReferences의 {$finalEventView:E번호}는 sourceEventDetails 또는 sourceMovementContext.sessions[].movementEventDetails에서 같은 id인 사건의 id/sessionId/timeMs/eventCode 원문을 그대로 다시 보여주는 참조다. "
            + "이동 사건의 sessionId는 해당 부모 세션 값이다. 다른 객체 행은 원래 값이며 허용 근거 ID와 순서는 유지한다.";
    private static final String SHARED_FIELD="finalSourceShared";
    private static final String CORE_RULE="$a:[행수,열자료]는 배열, $m:[속성명목록,열자료]는 순서대로 이름과 복원값을 합친 객체다. "
            + "열자료 배열=행별원문, =:값=공통원문, #:[사전,0기준참조], +:[문자접두,접미열], f:속성별열+r:나머지객체열, g:[[0기준행위치,열자료]], i:배열위치별열. "
            + "f안 q:[접두문자,정수속성명]=같은행의 접두+정수원문 문자열. null/누락/0/false/빈값/순서 보존. $l/$x/$h는 예약키 원본객체다. "
            + "$ev:사건ID=sourceEventDetails 또는 sourceMovementContext.sessions[].movementEventDetails의 같은id 원본 id/sessionId/timeMs/eventCode 사본. 이동sessionId=부모값.";
    private static final String VIEW_RULE=" $v:[T,id]=taskContext의 sourceEventId=id인 행의 sessionId/sourceEventId+mission.objectives/budget 사본. "
            + "[P,id]=sourceEventDetails의 id=id인 행의 sourceEventId=id,sessionId,product=selectedProduct 사본. [E,id]=같은 사건행 전체.";
    private static final String SHARE_RULE=" $r:n은 finalSourceShared의 n 원문으로 재귀 복원한다.";
    private static final String EVENT_SET_RULE=" $eventSet:[추가원문행]은 sourceEventDetails와 sourceMovementContext.sessions[].movementEventDetails의 모든 같은-ID 원본 id/sessionId/timeMs/eventCode 사본에 추가원문행을 합쳐 숫자 E 순서로 복원한다. 이동 sessionId=부모값. 원래 인용 행과 정확히 같은 경우만 쓴다.";
    private static final Set<String> V2_RESERVED=Set.of(VERSION_FIELD,RULE_FIELD,SHARED_FIELD,"$ev","$v","$eventSet","$x","$r","$h",COLUMNS,LITERAL,EVENT_VIEW);
    private final ObjectMapper mapper;

    public FinalSourceEncoding(ObjectMapper mapper) { this.mapper = mapper; }

    /** Keep ID/product/quantity source pairs literal for the model; pack only the full source. */
    public ObjectNode encodeReadable(ObjectNode source) {
        var rest = source.deepCopy();
        rest.remove(ReadableSourceFacts.FIELD);
        var result = encode(rest);
        var facts=ReadableSourceFacts.build(mapper,rest);
        // Keep literal ID/product/quantity pairs. Repeated mechanical count tables
        // use the same reversible column rules already included in this envelope.
        if(facts.has("recordedActionPresence")){
            var presence=facts.get("recordedActionPresence");
            var columns=new FinalSourceColumns(mapper).encode(presence);
            if(QwenTokenCounter.count(columns.toString())<QwenTokenCounter.count(presence.toString()))facts.set("recordedActionPresence",columns);
        }
        result.set(ReadableSourceFacts.FIELD,facts);
        return result;
    }

    public ObjectNode encode(ObjectNode source) {
        var build=new Build(source);
        var prepared=prepareObject(source,build,true);
        if(v2Reserved(source))prepared=mapper.createObjectNode().set("$x",prepared);
        var columns=(ObjectNode)new FinalSourceColumns(mapper).encode(prepared);
        String rule=CORE_RULE+(build.viewsUsed?VIEW_RULE:"")+(build.eventSetUsed?EVENT_SET_RULE:"");
        var sharing=new Sharing();sharing.count(columns);
        var shared=(ObjectNode)sharing.value(columns);
        var original=columns.deepCopy();original.put(VERSION_FIELD,VERSION).put(RULE_FIELD,rule);
        if(!sharing.dictionary.isEmpty()) {
            shared.set(SHARED_FIELD,sharing.dictionary);shared.put(VERSION_FIELD,VERSION).put(RULE_FIELD,rule+SHARE_RULE);
            if(QwenTokenCounter.count(shared.toString())<QwenTokenCounter.count(original.toString()))return shared;
        }
        return original;
    }

    private ObjectNode prepareObject(ObjectNode source,Build build,boolean root) {
        var result=mapper.createObjectNode();
        for(String key:source.propertyNames()) {
            JsonNode value=source.get(key);
            if(root&&key.equals("evidenceReferences")&&value.isArray()) {
                var additional=eventSetAdditional((ArrayNode)value,build);
                if(additional!=null){result.set(key,mapper.createObjectNode().set("$eventSet",additional));build.eventSetUsed=true;continue;}
                var rows=mapper.createArrayNode();
                for(var row:value){var tuple=build.events.get(row.path("id").asString());rows.add(tuple!=null&&tuple.equals(row)?mapper.createObjectNode().set("$ev",row.get("id")):prepare(row,build));}
                result.set(key,rows);
            } else if(root&&key.equals("taskComparisonSource")&&value.isObject()) {
                var comparison=mapper.createObjectNode();
                for(String field:((ObjectNode)value).propertyNames()) {
                    String type=switch(field){case "requirements"->"T";case "selectedProducts"->"P";case "submissions"->"E";default->null;};
                    JsonNode raw=value.get(field);
                    if(type==null||!raw.isArray()){comparison.set(field,prepare(raw,build));continue;}
                    var rows=mapper.createArrayNode();
                    for(var row:raw){String id=row.path(type.equals("E")?"id":"sourceEventId").asString();JsonNode expected=build.view(type,id);
                        if(expected!=null&&expected.equals(row)){rows.add(mapper.createObjectNode().set("$v",mapper.createArrayNode().add(type).add(id)));build.viewsUsed=true;}
                        else rows.add(prepare(row,build));}
                    comparison.set(field,rows);
                }
                result.set(key,v2Reserved((ObjectNode)value)?mapper.createObjectNode().set("$x",comparison):comparison);
            } else result.set(key,prepare(value,build));
        }
        return result;
    }
    private JsonNode prepare(JsonNode value,Build build) {
        if(value instanceof ObjectNode object){var encoded=prepareObject(object,build,false);return v2Reserved(object)?mapper.createObjectNode().set("$x",encoded):encoded;}
        if(value instanceof ArrayNode array){var encoded=mapper.createArrayNode();array.forEach(item->encoded.add(prepare(item,build)));return encoded;}
        return value.deepCopy();
    }
    private final class Build {
        final Map<String,JsonNode> events;
        final Map<String,JsonNode> tasks=new HashMap<>(),products=new HashMap<>(),rows=new HashMap<>();
        final Set<String> ambiguousTasks=new HashSet<>(),ambiguousRows=new HashSet<>();
        boolean viewsUsed,eventSetUsed;
        Build(ObjectNode source) {
            events=eventIndex(source);
            for(var task:source.path("taskContext"))if(task.isObject()&&task.path("sourceEventId").isString()) {
                var projected=mapper.createObjectNode();for(String field:List.of("sessionId","sourceEventId"))if(task.has(field))projected.set(field,task.get(field).deepCopy());
                for(String field:List.of("objectives","budget"))if(task.path("mission").has(field))projected.set(field,task.path("mission").get(field).deepCopy());
                putUnique(tasks,ambiguousTasks,task.path("sourceEventId").asString(),projected);
            }
            for(var event:source.path(SourceEventDetails.FIELD))if(event.isObject()&&event.path("id").isString())
                putUnique(rows,ambiguousRows,event.path("id").asString(),event.deepCopy());
            ambiguousTasks.forEach(tasks::remove);ambiguousRows.forEach(rows::remove);
            rows.forEach((id,event)->{if(event.has("selectedProduct")&&event.has("sessionId")){var product=mapper.createObjectNode();product.put("sourceEventId",id);product.set("sessionId",event.get("sessionId").deepCopy());product.set("product",event.get("selectedProduct").deepCopy());products.put(id,product);}});
        }
        JsonNode view(String type,String id){return switch(type){case "T"->tasks.get(id);case "P"->products.get(id);case "E"->rows.get(id);default->null;};}
    }
    private ArrayNode eventSetAdditional(ArrayNode references,Build build){
        if(build.events.size()<20)return null;
        var byId=new LinkedHashMap<String,JsonNode>();String previous="";
        for(var row:references){String id=row.path("id").asString();if(!id.matches("E[1-9][0-9]*")||byId.putIfAbsent(id,row)!=null)return null;
            if(!previous.isEmpty()&&new java.math.BigInteger(previous.substring(1)).compareTo(new java.math.BigInteger(id.substring(1)))>=0)return null;previous=id;}
        for(var item:build.events.entrySet())if(!item.getValue().equals(byId.get(item.getKey())))return null;
        var additional=mapper.createArrayNode();for(var item:byId.entrySet())if(!build.events.containsKey(item.getKey()))additional.add(item.getValue().deepCopy());return additional;
    }
    private void putUnique(Map<String,JsonNode> values,Set<String> ambiguous,String id,JsonNode value){var prior=values.putIfAbsent(id,value);if(prior!=null&&!prior.equals(value))ambiguous.add(id);}

    private final class Sharing {
        final Map<JsonNode,Integer> occurrences=new HashMap<>();final Map<JsonNode,String> aliases=new LinkedHashMap<>();final ObjectNode dictionary=mapper.createObjectNode();
        void count(JsonNode node){
            if(node.isObject()||node.isArray()||node.isString()) occurrences.merge(node,1,Integer::sum);
            if(node.isObject()||node.isArray()) node.forEach(this::count);
        }
        JsonNode value(JsonNode node) {
            // Repeated literal source text can share the same existing reversible dictionary as
            // containers. Short IDs remain literal; encodeReadable still exposes factual pairs.
            if((node.isObject()||node.isArray()||node.isString())&&occurrences.getOrDefault(node,0)>1) {
                int original=QwenTokenCounter.count(node.toString());var ref=mapper.createObjectNode().put("$r",aliases.size());int cost=QwenTokenCounter.count(ref.toString());
                if(original>=12&&(original-cost)*occurrences.get(node)>original+8) {
                    String alias=aliases.get(node);if(alias==null){alias=Integer.toString(aliases.size());aliases.put(node,alias);dictionary.set(alias,literal(node));}
                    return mapper.createObjectNode().put("$r",Integer.parseInt(alias));
                }
            }
            return literal(node);
        }
        JsonNode literal(JsonNode node) {
            if(node instanceof ObjectNode object){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,value(object.get(key)));return object.has("$r")||object.has("$h")?mapper.createObjectNode().set("$h",result):result;}
            if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(value(item)));return result;}
            return node.deepCopy();
        }
    }

    private JsonNode unshare(JsonNode value,JsonNode dictionary,int depth) {
        if(depth>100)throw new IllegalArgumentException("INVALID_FINAL_SOURCE_REFERENCE_DEPTH");
        if(value instanceof ObjectNode object) {
            if(object.size()==1&&object.has("$h")){if(!(object.get("$h") instanceof ObjectNode literal))throw invalidV2();return unshareObject(literal,dictionary,depth);}
            if(object.size()==1&&object.has("$r")){var ref=object.get("$r");if(!ref.isIntegralNumber()||ref.asInt()<0||!Integer.toString(ref.asInt()).equals(ref.toString())||!dictionary.has(ref.toString()))throw invalidV2();return unshare(dictionary.get(ref.toString()),dictionary,depth+1);}
            return unshareObject(object,dictionary,depth);
        }
        if(value instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(unshare(item,dictionary,depth)));return result;}
        return value.deepCopy();
    }
    private ObjectNode unshareObject(ObjectNode object,JsonNode dictionary,int depth){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,unshare(object.get(key),dictionary,depth));return result;}
    private JsonNode restoreV2(JsonNode value,Build build) {
        if(value instanceof ObjectNode object) {
            if(object.size()==1&&object.has("$x")){if(!(object.get("$x") instanceof ObjectNode literal))throw invalidV2();return restoreV2Object(literal,build);}
            if(object.size()==1&&object.has("$ev")){if(build==null)return object.deepCopy();JsonNode id=object.get("$ev");if(!id.isString()||!build.events.containsKey(id.asString()))throw invalidV2();return build.events.get(id.asString()).deepCopy();}
            if(object.size()==1&&object.has("$eventSet")){
                if(build==null)return object.deepCopy();if(!object.get("$eventSet").isArray())throw invalidV2();
                var rows=new HashMap<String,JsonNode>(build.events);for(var row:object.get("$eventSet")){String id=row.path("id").asString();if(!id.matches("E[1-9][0-9]*")||rows.putIfAbsent(id,row)!=null)throw invalidV2();}
                if(rows.keySet().stream().anyMatch(id->!id.matches("E[1-9][0-9]*")))throw invalidV2();
                var result=mapper.createArrayNode();rows.entrySet().stream().sorted(java.util.Comparator.comparing(item->new java.math.BigInteger(item.getKey().substring(1)))).forEach(item->result.add(item.getValue().deepCopy()));return result;
            }
            if(object.size()==1&&object.has("$v")){if(build==null)return object.deepCopy();JsonNode pair=object.get("$v");if(!pair.isArray()||pair.size()!=2||!pair.get(0).isString()||!pair.get(1).isString())throw invalidV2();JsonNode row=build.view(pair.get(0).asString(),pair.get(1).asString());if(row==null)throw invalidV2();return row.deepCopy();}
            return restoreV2Object(object,build);
        }
        if(value instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(restoreV2(item,build)));return result;}
        return value.deepCopy();
    }
    private ObjectNode restoreV2Object(ObjectNode object,Build build){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,restoreV2(object.get(key),build));return result;}
    private static boolean v2Reserved(ObjectNode object){return V2_RESERVED.stream().anyMatch(object::has);}
    private IllegalArgumentException invalidV2(){return new IllegalArgumentException("INVALID_FINAL_SOURCE_ENCODING");}

    /** Older v1 audits use a separate unchanged decoder, never a rewritten checkpoint. */
    private ObjectNode encodeLegacy(ObjectNode source) {
        var index = eventIndex(source);
        ObjectNode encoded = encodeObject(source, index, true);
        // Metadata collisions in the original root are escaped together with its other original values.
        if (reserved(source)) encoded = mapper.createObjectNode().set(LITERAL, encoded);
        encoded.put(VERSION_FIELD, "final-source-v1");
        encoded.put(RULE_FIELD, LEGACY_RULE);
        return (ObjectNode) new LosslessTables(mapper).encode(encoded);
    }

    /** Also reads older table-only final sources so their immutable audit records remain usable. */
    public ObjectNode decode(JsonNode source) {
        if(VERSION.equals(source.path(VERSION_FIELD).asString())) {
            if(!(source instanceof ObjectNode root))throw invalidV2();
            String rule=root.path(RULE_FIELD).asString();
            if(!Set.of(CORE_RULE,CORE_RULE+VIEW_RULE,CORE_RULE+SHARE_RULE,CORE_RULE+VIEW_RULE+SHARE_RULE,
                    CORE_RULE+EVENT_SET_RULE,CORE_RULE+VIEW_RULE+EVENT_SET_RULE,CORE_RULE+EVENT_SET_RULE+SHARE_RULE,CORE_RULE+VIEW_RULE+EVENT_SET_RULE+SHARE_RULE).contains(rule))throw invalidV2();
            boolean shared=root.has(SHARED_FIELD);
            if(shared!=rule.endsWith(SHARE_RULE))throw invalidV2();
            var encoded=root.deepCopy();JsonNode dictionary=encoded.has(SHARED_FIELD)?encoded.get(SHARED_FIELD):mapper.createObjectNode();
            if(!dictionary.isObject())throw invalidV2();
            encoded.remove(List.of(VERSION_FIELD,RULE_FIELD,SHARED_FIELD));
            var columns=new FinalSourceColumns(mapper).decode(shared?unshare(encoded,dictionary,0):encoded);
            if(!(restoreV2(columns,null) instanceof ObjectNode partial))throw invalidV2();
            return (ObjectNode)restoreV2(columns,new Build(partial));
        }
        var tables = new LosslessTables(mapper);
        ObjectNode encoded = (ObjectNode) tables.decode(source);
        if (!encoded.has(VERSION_FIELD)) return encoded;
        if (!"final-source-v1".equals(encoded.path(VERSION_FIELD).asString()) || !LEGACY_RULE.equals(encoded.path(RULE_FIELD).asString()))
            throw new IllegalArgumentException("UNKNOWN_FINAL_SOURCE_ENCODING");
        encoded.remove(List.of(VERSION_FIELD, RULE_FIELD));
        // Restore the raw sources first to obtain exact tuples. Do not infer values from absent fields.
        ObjectNode partial = (ObjectNode) restore(encoded, null);
        return (ObjectNode) restore(encoded, eventIndex(partial));
    }

    private ObjectNode encodeObject(ObjectNode source, Map<String, JsonNode> index, boolean root) {
        var result = mapper.createObjectNode();
        for (String key : source.propertyNames()) {
            JsonNode value = source.get(key);
            result.set(key, root && key.equals("evidenceReferences") && value.isArray()
                    ? encodeReferences((ArrayNode) value, index) : encodeValue(value, index));
        }
        return result;
    }

    private JsonNode encodeValue(JsonNode value, Map<String, JsonNode> index) {
        if (value instanceof ObjectNode object) {
            ObjectNode encoded = encodeObject(object, index, false);
            return reserved(object) ? mapper.createObjectNode().set(LITERAL, encoded) : encoded;
        }
        if (value instanceof ArrayNode array) {
            var encoded = mapper.createArrayNode();
            array.forEach(item -> encoded.add(encodeValue(item, index)));
            return encodeArray(encoded);
        }
        return value.deepCopy();
    }

    private JsonNode encodeReferences(ArrayNode references, Map<String, JsonNode> index) {
        var rows = mapper.createArrayNode();
        for (var row : references) {
            String id = row.path("id").isString() ? row.path("id").asString() : null;
            JsonNode original = id == null ? null : index.get(id);
            // Exact equality includes the field set, types, nulls and every tuple value.
            rows.add(original != null && original.equals(row)
                    ? mapper.createObjectNode().put(EVENT_VIEW, id) : encodeValue(row, index));
        }
        return encodeArray(rows);
    }

    private JsonNode encodeArray(ArrayNode rows) {
        if (rows.size() < 3) return rows;
        var values = new ArrayList<JsonNode>();
        rows.forEach(values::add);
        var columns = mapper.createObjectNode().set(COLUMNS, new LosslessEventColumns(mapper).encodeValues(values));
        return QwenTokenCounter.count(columns.toString()) < QwenTokenCounter.count(rows.toString()) ? columns : rows;
    }

    private JsonNode restore(JsonNode value, Map<String, JsonNode> index) {
        if (value instanceof ObjectNode object) {
            if (object.size() == 1 && object.has(LITERAL)) {
                if (!(object.get(LITERAL) instanceof ObjectNode literal))
                    throw new IllegalArgumentException("INVALID_FINAL_SOURCE_LITERAL");
                // The original object's reserved keys are ordinary data, not another encoding layer.
                return restoreObject(literal, index);
            }
            if (object.size() == 1 && object.has(COLUMNS))
                return restore(new LosslessEventColumns(mapper).decodeValues(object.get(COLUMNS)), index);
            if (object.size() == 1 && object.has(EVENT_VIEW)) {
                if (index == null) return object.deepCopy();
                JsonNode id = object.get(EVENT_VIEW);
                if (!id.isString() || !index.containsKey(id.asString()))
                    throw new IllegalArgumentException("UNKNOWN_FINAL_SOURCE_EVENT_VIEW");
                return index.get(id.asString()).deepCopy();
            }
            return restoreObject(object, index);
        }
        if (value instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(restore(item, index)));
            return result;
        }
        return value.deepCopy();
    }

    private ObjectNode restoreObject(ObjectNode object, Map<String, JsonNode> index) {
        var result = mapper.createObjectNode();
        for (String key : object.propertyNames()) result.set(key, restore(object.get(key), index));
        return result;
    }

    private Map<String, JsonNode> eventIndex(ObjectNode source) {
        var result = new HashMap<String, JsonNode>();
        var ambiguous = new HashSet<String>();
        for (var event : source.path(SourceEventDetails.FIELD)) addEvent(result, ambiguous, event, null);
        for (var session : source.path(MovementSourceContext.FIELD).path("sessions"))
            for (var event : session.path("movementEventDetails")) addEvent(result, ambiguous, event, session);
        ambiguous.forEach(result::remove);
        return result;
    }

    private void addEvent(Map<String, JsonNode> index, Set<String> ambiguous, JsonNode event, JsonNode session) {
        if (!event.isObject() || !event.path("id").isString()) return;
        var tuple = mapper.createObjectNode();
        for (String field : EVENT_FIELDS) if (event.has(field)) tuple.set(field, event.get(field).deepCopy());
        if (session != null && session.has("sessionId")) {
            if (tuple.has("sessionId") && !tuple.get("sessionId").equals(session.get("sessionId"))) {
                ambiguous.add(event.path("id").asString());
                return;
            }
            tuple.set("sessionId", session.get("sessionId").deepCopy());
        }
        if (!tuple.path("id").isString() || tuple.path("id").asString().isBlank()
                || !tuple.path("sessionId").isString() || tuple.path("sessionId").asString().isBlank()
                || !tuple.path("timeMs").isNumber()
                || !tuple.path("eventCode").isString() || tuple.path("eventCode").asString().isBlank()) return;
        String id = event.path("id").asString();
        JsonNode previous = index.putIfAbsent(id, tuple);
        if (previous != null && !previous.equals(tuple)) ambiguous.add(id);
    }

    private static boolean reserved(ObjectNode object) { return RESERVED.stream().anyMatch(object::has); }
}
