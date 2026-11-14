package oneuldo.behaviorlog.analysis.service;

import java.math.BigDecimal;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Decimal arithmetic on the original JSON literals; no floating-point subtraction or rounding. */
public final class ExactNumericDeltas {
    public static final String FIELD="exactNumericDeltaRule";
    public static final String RULE="$nd:[scale,first,differences] restores a numeric array by exact DECIMAL addition, never binary floating point. differences is space-separated number text. Integer scale applies to every value; string scale gives one character per original value, A=0 decimals, B=1, etc. Accumulate differences and write each value at its original scale, with no rounding. All values, integer/decimal types, zeros and order survive. $ndl wraps original reserved-key objects. Literal event IDs/index are unchanged.";
    private final ObjectMapper m;
    private boolean used;
    public ExactNumericDeltas(ObjectMapper mapper){m=mapper;}
    public ObjectNode encode(ObjectNode source){
        if(source.has(FIELD))throw invalid();
        var result=(ObjectNode)encodeValue(source);
        if(used)result.put(FIELD,RULE);
        return result;
    }
    private JsonNode encodeValue(JsonNode n){
        if(n instanceof ObjectNode object){
            var result=m.createObjectNode();for(String k:object.propertyNames())result.set(k,encodeValue(object.get(k)));
            if(object.has("$nd")||object.has("$ndl")){used=true;return m.createObjectNode().set("$ndl",result);}
            return result;
        }
        if(n instanceof ArrayNode array){
            var plain=m.createArrayNode();array.forEach(v->plain.add(encodeValue(v)));
            // Small task quantities and readable source pairs stay literal.
            if(array.size()<32||!array.valueStream().allMatch(JsonNode::isNumber))return plain;
            Integer scale=null;boolean sameScale=true;BigDecimal prior=null;var differences=new java.util.ArrayList<String>();var scales=new StringBuilder();
            for(var number:array){
                String text=number.toString();
                if(!text.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?")||text.startsWith("-0"))return plain;
                var value=new BigDecimal(text);
                if(scale==null)scale=value.scale();
                if(value.scale()>32||number.isIntegralNumber()!=(value.scale()==0))return plain;
                if(value.scale()!=scale)sameScale=false;
                scales.append((char)('A'+value.scale()));
                if(prior!=null)differences.add(value.subtract(prior).stripTrailingZeros().toPlainString());
                prior=value;
            }
            var data=m.createArrayNode();if(sameScale)data.add(scale);else data.add(scales.toString());
            data.add(array.get(0).toString()).add(String.join(" ",differences));
            var packed=m.createObjectNode().set("$nd",data);
            if(QwenTokenCounter.count(packed.toString())+32<QwenTokenCounter.count(plain.toString())){used=true;return packed;}
            return plain;
        }
        return n.deepCopy();
    }
    public static ObjectNode decode(ObjectMapper m,ObjectNode wire){
        if(!RULE.equals(wire.path(FIELD).asString()))throw invalid();
        var source=wire.deepCopy();source.remove(FIELD);return (ObjectNode)decodeValue(m,source);
    }
    private static JsonNode decodeValue(ObjectMapper m,JsonNode n){
        if(n instanceof ObjectNode o){
            if(o.size()==1&&o.has("$ndl")){
                if(!(o.get("$ndl") instanceof ObjectNode literal))throw invalid();return decodeObject(m,literal);
            }
            if(o.size()==1&&o.has("$nd")){
                var data=o.get("$nd");
                if(!data.isArray()||data.size()!=3||!data.get(1).isString()||!data.get(2).isString())throw invalid();
                var scale=data.get(0);String[] deltas=data.get(2).asString().isEmpty()?new String[0]:data.get(2).asString().split(" ",-1);
                if(scale.isIntegralNumber()){if(!scale.canConvertToInt()||scale.asInt()<0||scale.asInt()>32)throw invalid();}
                else if(!scale.isString()||scale.asString().length()!=deltas.length+1)throw invalid();
                BigDecimal value=literal(data.get(1));var result=m.createArrayNode();
                result.add(m.readTree(value.setScale(scale(scale,0)).toPlainString()));
                for(int i=0;i<deltas.length;i++){value=value.add(literal(m.getNodeFactory().stringNode(deltas[i])));result.add(m.readTree(value.setScale(scale(scale,i+1)).toPlainString()));}
                return result;
            }
            return decodeObject(m,o);
        }
        if(n instanceof ArrayNode a){var result=m.createArrayNode();a.forEach(v->result.add(decodeValue(m,v)));return result;}
        return n.deepCopy();
    }
    private static BigDecimal literal(JsonNode n){
        if(!n.isString()||!n.asString().matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?"))throw invalid();
        return new BigDecimal(n.asString());
    }
    private static int scale(JsonNode scale,int index){int value=scale.isIntegralNumber()?scale.asInt():scale.asString().charAt(index)-'A';if(value<0||value>32)throw invalid();return value;}
    private static ObjectNode decodeObject(ObjectMapper m,ObjectNode o){var result=m.createObjectNode();for(String k:o.propertyNames())result.set(k,decodeValue(m,o.get(k)));return result;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_EXACT_NUMERIC_DELTAS");}
}
