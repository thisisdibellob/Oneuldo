package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Concatenates exact JSON number text only; no arithmetic, rounding, deltas or ID aliases. */
final class AdaptiveNumericColumnText {
    static final String RULE_FIELD="adaptiveNumericColumnRule";
    static final String RULE="$nc:[길이,숫자원문]은 정확한 JSON number 배열이다. 길이가 정수면 모든 원문 길이, 문자열이면 각 문자 A=1..Z=26이다. 숫자원문을 그 길이로 순서대로 잘라 JSON number로 복원한다(공백·구분자만 공유). 부호·소수·지수·0·값·타입·순서는 그대로다. $ncl:{...}는 원래 예약키 객체. E사건ID는 숫자행 위치가 아닌 원래 리터럴이며 새 ID를 만들지 않는다.";
    private final ObjectMapper mapper;
    private boolean used;
    AdaptiveNumericColumnText(ObjectMapper mapper){this.mapper=mapper;}
    ObjectNode encode(ObjectNode source){
        if(source.has(RULE_FIELD))throw invalid();
        var result=(ObjectNode)encodeValue(source);
        if(used)result.put(RULE_FIELD,RULE);
        return result;
    }
    private JsonNode encodeValue(JsonNode node){
        if(node instanceof ArrayNode array){
            var plain=mapper.createArrayNode();array.forEach(item->plain.add(encodeValue(item)));
            if(array.size()<6||!array.valueStream().allMatch(JsonNode::isNumber))return plain;
            StringBuilder text=new StringBuilder(),widths=new StringBuilder();int common=-1;
            for(var number:array){
                String literal=number.toString();
                if(literal.length()<1||literal.length()>26||!literal.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))return plain;
                var parsed=mapper.readTree(literal);
                if(!parsed.toString().equals(literal)||parsed.isIntegralNumber()!=number.isIntegralNumber())return plain;
                text.append(literal);widths.append((char)('A'+literal.length()-1));
                if(common==-1)common=literal.length();else if(common!=literal.length())common=0;
            }
            var data=mapper.createArrayNode();if(common>0)data.add(common);else data.add(widths.toString());data.add(text.toString());
            var packed=mapper.createObjectNode().set("$nc",data);
            if(QwenTokenCounter.count(packed.toString())<QwenTokenCounter.count(plain.toString())){used=true;return packed;}
            return plain;
        }
        if(node instanceof ObjectNode object){
            var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,encodeValue(object.get(key)));
            if(object.has("$nc")||object.has("$ncl")){used=true;return mapper.createObjectNode().set("$ncl",result);}
            return result;
        }
        return node.deepCopy();
    }
    static ObjectNode decode(ObjectMapper mapper,ObjectNode source){
        if(!RULE.equals(source.path(RULE_FIELD).asString()))throw invalid();
        var copy=source.deepCopy();copy.remove(RULE_FIELD);return (ObjectNode)decodeValue(mapper,copy);
    }
    private static JsonNode decodeValue(ObjectMapper mapper,JsonNode node){
        if(node instanceof ObjectNode object){
            if(object.size()==1&&object.has("$ncl")){
                if(!(object.get("$ncl") instanceof ObjectNode literal))throw invalid();return decodeObject(mapper,literal);
            }
            if(object.size()==1&&object.has("$nc")){
                var pair=object.get("$nc");if(!pair.isArray()||pair.size()!=2||!pair.get(1).isString())throw invalid();
                var width=pair.get(0);String text=pair.get(1).asString();var result=mapper.createArrayNode();
                int offset=0,index=0;
                if(width.isIntegralNumber()&&(!width.canConvertToInt()||width.asInt()<1||width.asInt()>26))throw invalid();
                if(!width.isIntegralNumber()&&!width.isString())throw invalid();
                while(offset<text.length()){
                    int count;
                    if(width.isIntegralNumber())count=width.asInt();
                    else{if(index>=width.asString().length())throw invalid();count=width.asString().charAt(index)-'A'+1;if(count<1||count>26)throw invalid();}
                    if(offset+count>text.length())throw invalid();
                    String literal=text.substring(offset,offset+count);
                    if(!literal.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))throw invalid();
                    var number=mapper.readTree(literal);if(!number.isNumber())throw invalid();result.add(number);
                    offset+=count;index++;
                }
                if(width.isString()&&index!=width.asString().length())throw invalid();
                return result;
            }
            return decodeObject(mapper,object);
        }
        if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(decodeValue(mapper,item)));return result;}
        return node.deepCopy();
    }
    private static ObjectNode decodeObject(ObjectMapper mapper,ObjectNode object){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,decodeValue(mapper,object.get(key)));return result;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_ADAPTIVE_NUMERIC_COLUMN_TEXT");}
}
