package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import oneuldo.behaviorlog.analysis.service.FinalSourceColumns;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Generation-only exact ordered object-key templates; values retain their original JSON types. */
final class AdaptiveObjectTuples {
    static final String FIELD="adaptiveObjectKeys",RULE_FIELD="adaptiveObjectKeyRule";
    static final String RULE="[\"A\",값…]의 첫 문자 A..Z,a..z=0..51은 adaptiveObjectKeys의 속성명 목록이다. [\"#\",속성명목록,값배열]의 값배열은 finalSourceEncoding의 $a 열규칙으로 먼저 복원한다. 이름 순서대로 값을 합쳐 원문 객체로 재귀 복원한다. [\"~\",배열]은 예약문자로 시작한 원래 배열. 그 뒤 기존 source decode 적용. 숫자 표기·타입·필드·순서·E사건ID 보존.";
    private static final String ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private final ObjectMapper mapper;
    private final Map<List<String>,Integer> counts=new HashMap<>(),indices=new LinkedHashMap<>();
    private final ArrayNode dictionary;
    private boolean matrixUsed;
    AdaptiveObjectTuples(ObjectMapper mapper){this.mapper=mapper;dictionary=mapper.createArrayNode();}
    /**
     * The output template and the already chosen design value are what the model must write back, so they are
     * never turned into tuples: a tuple-shaped template was being copied into the answer as an array.
     */
    static final List<String> LITERAL=List.of("outputSchema","requiredAiDesign");
    static final String LITERAL_RULE=" outputSchema·requiredAiDesign은 원문이며 응답도 그 객체 형태로 쓴다.";
    ObjectNode encode(ObjectNode source){
        if(source.has(FIELD)||source.has(RULE_FIELD))return source.deepCopy();
        var body=source.deepCopy();body.remove(LITERAL);
        count(body);select();var encoded=(ObjectNode)object(body,false);
        if(dictionary.isEmpty()&&!matrixUsed)return source.deepCopy();
        var result=mapper.createObjectNode();boolean kept=false;
        for(String field:source.propertyNames()) {
            if(LITERAL.contains(field)){result.set(field,source.get(field).deepCopy());kept=true;}
            else result.set(field,encoded.get(field));
        }
        result.set(FIELD,dictionary);result.put(RULE_FIELD,kept?RULE+LITERAL_RULE:RULE);return result;
    }
    private List<String> keys(JsonNode object){var result=new ArrayList<String>();object.propertyNames().forEach(result::add);return result;}
    private void count(JsonNode node){if(node.isObject())counts.merge(keys(node),1,Integer::sum);if(node.isObject()||node.isArray())node.forEach(this::count);}
    private void select(){
        var gains=new HashMap<List<String>,Integer>();
        for(var entry:counts.entrySet()){
            if(entry.getValue()<2||entry.getKey().isEmpty())continue;
            var plain=mapper.createObjectNode();var tuple=mapper.createArrayNode().add("A");for(String key:entry.getKey()){plain.putNull(key);tuple.addNull();}
            int saving=QwenTokenCounter.count(plain.toString())-QwenTokenCounter.count(tuple.toString());
            int gain=saving*entry.getValue()-QwenTokenCounter.count(mapper.valueToTree(entry.getKey()).toString())-3;
            if(saving>0&&gain>0)gains.put(entry.getKey(),gain);
        }
        gains.keySet().stream().sorted(Comparator.<List<String>>comparingInt(gains::get).reversed().thenComparing(keys->mapper.valueToTree(keys).toString())).limit(52).forEach(keys->{indices.put(keys,indices.size());dictionary.add(mapper.valueToTree(keys));});
    }
    private JsonNode value(JsonNode node){
        if(node instanceof ObjectNode object)return object(object,true);
        if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(value(item)));return reserved(array)?mapper.createArrayNode().add("~").add(result):result;}
        return node.deepCopy();
    }
    private JsonNode object(ObjectNode node,boolean compact){
        var keys=keys(node);
        var plain=mapper.createObjectNode();for(String key:keys)plain.set(key,value(node.get(key)));
        JsonNode result=plain;
        if(compact&&indices.containsKey(keys)){
            var tuple=mapper.createArrayNode().add(Character.toString(ALPHABET.charAt(indices.get(keys))));for(String key:keys)tuple.add(plain.get(key));result=tuple;
        }
        if(compact&&keys.size()>=4&&columnSafe(plain)){
            var values=mapper.createArrayNode();for(String key:keys)values.add(plain.get(key));
            var columns=new FinalSourceColumns(mapper,true).encode(values);
            var matrix=mapper.createArrayNode().add("#").add(mapper.valueToTree(keys)).add(columns);
            if(QwenTokenCounter.count(matrix.toString())<QwenTokenCounter.count(result.toString())){matrixUsed=true;result=matrix;}
        }
        return result;
    }
    private boolean columnSafe(JsonNode node){
        if(node.isNumber()){var parsed=mapper.readTree(node.toString());return parsed.toString().equals(node.toString())&&parsed.getClass().equals(node.getClass());}
        if(node.isObject()||node.isArray())for(var item:node)if(!columnSafe(item))return false;return true;
    }
    private static boolean reserved(JsonNode array){if(array.size()==0||!array.get(0).isString())return false;String first=array.get(0).asString();return Set.of("~","#").contains(first)||first.length()==1&&ALPHABET.indexOf(first.charAt(0))>=0;}
    static ObjectNode decode(ObjectMapper mapper,ObjectNode source){
        String rule=source.path(RULE_FIELD).asString();boolean literal=rule.equals(RULE+LITERAL_RULE);
        if(!literal&&!RULE.equals(rule)||!source.path(FIELD).isArray()||source.path(FIELD).size()>52)throw invalid();
        var dictionary=source.get(FIELD);for(var keys:dictionary){if(!keys.isArray()||keys.isEmpty())throw invalid();var unique=new HashSet<String>();for(var key:keys)if(!key.isString()||!unique.add(key.asString()))throw invalid();}
        var copy=source.deepCopy();copy.remove(List.of(FIELD,RULE_FIELD));
        if(!literal)return (ObjectNode)restore(mapper,copy,dictionary);
        // Requests encoded with the literal rule carry those fields untouched; older stored requests decode as before.
        var kept=mapper.createObjectNode();for(String field:LITERAL)if(copy.has(field))kept.set(field,copy.remove(field));
        var restored=(ObjectNode)restore(mapper,copy,dictionary);
        var result=mapper.createObjectNode();
        for(String field:source.propertyNames()){if(kept.has(field))result.set(field,kept.get(field));else if(restored.has(field))result.set(field,restored.get(field));}
        return result;
    }
    private static JsonNode restore(ObjectMapper mapper,JsonNode node,JsonNode dictionary){
        if(node instanceof ArrayNode array){
            if(reserved(array)){
                if("~".equals(array.get(0).asString())){if(array.size()!=2||!array.get(1).isArray())throw invalid();return restoreArray(mapper,array.get(1),dictionary);}
                if("#".equals(array.get(0).asString())){
                    if(array.size()!=3||!array.get(1).isArray())throw invalid();var keys=array.get(1);var values=new FinalSourceColumns(mapper).decode(array.get(2));if(!values.isArray()||keys.size()!=values.size())throw invalid();
                    var object=mapper.createObjectNode();var unique=new HashSet<String>();for(int i=0;i<keys.size();i++){var key=keys.get(i);if(!key.isString()||!unique.add(key.asString()))throw invalid();object.set(key.asString(),restore(mapper,values.get(i),dictionary));}return object;
                }
                int index=ALPHABET.indexOf(array.get(0).asString().charAt(0));
                if(index<0||index>=dictionary.size())throw invalid();var keys=dictionary.get(index);if(array.size()!=keys.size()+1)throw invalid();
                var object=mapper.createObjectNode();for(int i=0;i<keys.size();i++)object.set(keys.get(i).asString(),restore(mapper,array.get(i+1),dictionary));return object;
            }
            return restoreArray(mapper,array,dictionary);
        }
        if(node instanceof ObjectNode object){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,restore(mapper,object.get(key),dictionary));return result;}
        return node.deepCopy();
    }
    private static ArrayNode restoreArray(ObjectMapper mapper,JsonNode array,JsonNode dictionary){var result=mapper.createArrayNode();array.forEach(item->result.add(restore(mapper,item,dictionary)));return result;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_ADAPTIVE_OBJECT_KEYS");}
}
