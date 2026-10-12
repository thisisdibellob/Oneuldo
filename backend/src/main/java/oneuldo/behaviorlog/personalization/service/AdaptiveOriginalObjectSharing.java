package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Exact repeated original objects before column factoring, opt-in for generation only. */
final class AdaptiveOriginalObjectSharing {
    static final String DICTIONARY="adaptiveSharedOriginalObjects";
    static final String RULE_FIELD="adaptiveOriginalObjectRule";
    static final String RULE="$ao:n=adaptiveSharedOriginalObjects[n]의 동일 원문 객체를 재귀 복원한다. $aol:{...}는 원래 예약키 객체다. 좌표·시야·행동·상품·값·타입·순서는 그대로이며 사건 E별칭은 리터럴 원문이다. 공유는 삭제나 새 관찰이 아니다.";
    private final ObjectMapper mapper;
    private final int minimumTokens;
    private final Map<JsonNode,Integer> counts=new HashMap<>();
    private final Map<JsonNode,Integer> aliases=new LinkedHashMap<>();
    private final ArrayNode dictionary;
    AdaptiveOriginalObjectSharing(ObjectMapper mapper,int minimumTokens){this.mapper=mapper;this.minimumTokens=minimumTokens;this.dictionary=mapper.createArrayNode();}
    ObjectNode encode(ObjectNode source){
        if(source.has(DICTIONARY)||source.has(RULE_FIELD))throw new IllegalArgumentException("ADAPTIVE_ORIGINAL_OBJECT_COLLISION");
        count(source);var result=(ObjectNode)literal(source);
        if(!dictionary.isEmpty())result.set(DICTIONARY,dictionary);
        return result;
    }
    private void count(JsonNode node){
        if(node.isObject())counts.merge(node,1,Integer::sum);
        if(node.isObject()||node.isArray())node.forEach(this::count);
    }
    private JsonNode value(JsonNode node){
        if(node.isObject()&&counts.getOrDefault(node,0)>1&&QwenTokenCounter.count(node.toString())>=minimumTokens){
            Integer alias=aliases.get(node);
            if(alias==null){alias=aliases.size();aliases.put(node,alias);dictionary.addNull();dictionary.set(alias,literal(node));}
            return mapper.createObjectNode().put("$ao",alias);
        }
        return literal(node);
    }
    private JsonNode literal(JsonNode node){
        if(node instanceof ObjectNode object){
            var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,value(object.get(key)));
            return object.has("$ao")||object.has("$aol")?mapper.createObjectNode().set("$aol",result):result;
        }
        if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(value(item)));return result;}
        return node.deepCopy();
    }
    static ObjectNode decode(ObjectMapper mapper,ObjectNode source){
        var dictionary=source.get(DICTIONARY);
        if(dictionary==null||!dictionary.isArray())throw new IllegalArgumentException("INVALID_ADAPTIVE_ORIGINAL_OBJECTS");
        var result=source.deepCopy();result.remove(DICTIONARY);
        return (ObjectNode)restore(mapper,result,dictionary,0);
    }
    private static JsonNode restore(ObjectMapper mapper,JsonNode node,JsonNode dictionary,int depth){
        if(depth>100)throw new IllegalArgumentException("INVALID_ADAPTIVE_ORIGINAL_OBJECT_DEPTH");
        if(node instanceof ObjectNode object){
            if(object.size()==1&&object.has("$ao")){
                var index=object.get("$ao");
                if(!index.isIntegralNumber()||!index.canConvertToInt()||index.asInt()<0||index.asInt()>=dictionary.size())throw new IllegalArgumentException("INVALID_ADAPTIVE_ORIGINAL_OBJECT_REFERENCE");
                return restore(mapper,dictionary.get(index.asInt()),dictionary,depth+1);
            }
            if(object.size()==1&&object.has("$aol")){
                if(!(object.get("$aol") instanceof ObjectNode literal))throw new IllegalArgumentException("INVALID_ADAPTIVE_ORIGINAL_OBJECT_LITERAL");
                return restoreObject(mapper,literal,dictionary,depth);
            }
            return restoreObject(mapper,object,dictionary,depth);
        }
        if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(restore(mapper,item,dictionary,depth)));return result;}
        return node.deepCopy();
    }
    private static ObjectNode restoreObject(ObjectMapper mapper,ObjectNode object,JsonNode dictionary,int depth){
        var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,restore(mapper,object.get(key),dictionary,depth));return result;
    }
}
