package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Exact column transport with compact operators; no selection, rounding or inferred values. */
public final class FinalSourceColumns {
    private static final Set<String> MARKERS = Set.of("$a", "$m", "$l");
    private final ObjectMapper mapper;
    private final Map<String,Integer> tokenCounts = new HashMap<>();
    public FinalSourceColumns(ObjectMapper mapper) { this.mapper=mapper; }

    public JsonNode encode(JsonNode source) {
        tokenCounts.clear();
        return encodeValue(source);
    }
    private JsonNode encodeValue(JsonNode source) {
        if(source instanceof ObjectNode object) {
            var plain=mapper.createObjectNode();
            for(String key:object.propertyNames()) plain.set(key,encodeValue(object.get(key)));
            if(MARKERS.stream().anyMatch(object::has)) return object("$l",plain);
            if(object.size()>=3 && values(object).stream().allMatch(JsonNode::isObject))
                return best(plain,object("$m",array(mapper.valueToTree(object.propertyNames()),series(values(plain)))));
            return plain;
        }
        if(source instanceof ArrayNode array) {
            var rows=mapper.createArrayNode();array.forEach(value->rows.add(encodeValue(value)));
            return rows.size()<3 ? rows : best(rows,object("$a",array(mapper.valueToTree(rows.size()),series(values(rows)))));
        }
        return source.deepCopy();
    }
    private JsonNode series(List<JsonNode> rows) {
        JsonNode plain=mapper.valueToTree(rows),best=plain;
        if(rows.isEmpty()) return plain;
        JsonNode first=rows.getFirst();
        if(rows.stream().allMatch(first::equals)) return best(plain,object("=",first));
        var dictionary=new LinkedHashMap<JsonNode,Integer>();var refs=mapper.createArrayNode();
        rows.forEach(row->refs.add(dictionary.computeIfAbsent(row,key->dictionary.size())));
        if(dictionary.size()<rows.size()) best=best(best,object("#",array(mapper.valueToTree(dictionary.keySet()),refs)));
        if(rows.stream().allMatch(JsonNode::isString)) {
            String prefix=first.asString();
            for(var row:rows) {int end=0;String text=row.asString();while(end<prefix.length()&&end<text.length()&&prefix.charAt(end)==text.charAt(end))end++;prefix=prefix.substring(0,end);}
            if(!prefix.isEmpty()&&Character.isHighSurrogate(prefix.charAt(prefix.length()-1)))prefix=prefix.substring(0,prefix.length()-1);
            if(!prefix.isEmpty()) {int length=prefix.length();best=best(best,object("+",array(mapper.valueToTree(prefix),series(rows.stream().map(row->(JsonNode)mapper.getNodeFactory().stringNode(row.asString().substring(length))).toList()))));}
        }
        if(rows.stream().allMatch(JsonNode::isObject)) {
            var shapes=new LinkedHashMap<Set<String>,List<Integer>>();
            for(int i=0;i<rows.size();i++)shapes.computeIfAbsent(new TreeSet<>(((ObjectNode)rows.get(i)).propertyNames()),key->new ArrayList<>()).add(i);
            if(shapes.size()==1) best=best(best,fields(rows));
            else {
                var common=new TreeSet<>(((ObjectNode)first).propertyNames());rows.forEach(row->common.retainAll(((ObjectNode)row).propertyNames()));
                if(!common.isEmpty()) {
                    var candidate=object("f",fieldData(rows,common));
                    candidate.set("r",series(rows.stream().map(row->{var extra=((ObjectNode)row).deepCopy();extra.remove(common);return (JsonNode)extra;}).toList()));
                    best=best(best,candidate);
                }
                var groups=mapper.createArrayNode();
                for(var positions:shapes.values())groups.add(array(mapper.valueToTree(positions),fields(positions.stream().map(rows::get).toList())));
                best=best(best,object("g",groups));
            }
        }
        if(rows.stream().allMatch(row->row.isArray()&&row.size()==first.size())) {
            var items=mapper.createArrayNode();
            for(int i=0;i<first.size();i++){int position=i;items.add(series(rows.stream().map(row->row.get(position)).toList()));}
            best=best(best,object("i",items));
        }
        return best;
    }
    private ObjectNode fields(List<JsonNode> rows){return object("f",fieldData(rows,new TreeSet<>(((ObjectNode)rows.getFirst()).propertyNames())));}
    private ObjectNode fieldData(List<JsonNode> rows,Set<String> keys) {
        var result=mapper.createObjectNode();
        for(String key:keys)result.set(key,series(rows.stream().map(row->row.get(key)).toList()));
        for(String target:keys)if(rows.stream().allMatch(row->row.get(target).isString()))
            for(String source:keys)if(!source.equals(target)&&rows.stream().allMatch(row->row.get(source).isIntegralNumber())) {
                String text=rows.getFirst().get(target).asString(),number=rows.getFirst().get(source).toString();
                if(!text.endsWith(number))continue;
                String prefix=text.substring(0,text.length()-number.length());
                if(rows.stream().allMatch(row->row.get(target).asString().equals(prefix+row.get(source).toString())))
                    result.set(target,best(result.get(target),object("q",array(mapper.valueToTree(prefix),mapper.valueToTree(source)))));
            }
        return result;
    }
    public JsonNode decode(JsonNode encoded) {
        if(encoded instanceof ObjectNode object) {
            if(object.size()==1&&object.has("$l")) {
                if(!(object.get("$l") instanceof ObjectNode literal))throw invalid();
                return decodeObject(literal);
            }
            if(object.size()==1&&object.has("$a")) {
                var pair=pair(object.get("$a"));return decode(mapper.valueToTree(expand(pair.get(1),integer(pair.get(0)))));
            }
            if(object.size()==1&&object.has("$m")) {
                var pair=pair(object.get("$m"));if(!pair.get(0).isArray())throw invalid();
                var names=new HashSet<String>();for(var key:pair.get(0))if(!key.isString()||!names.add(key.asString()))throw invalid();
                var rows=expand(pair.get(1),pair.get(0).size());var result=mapper.createObjectNode();
                for(int i=0;i<rows.size();i++)result.set(pair.get(0).get(i).asString(),decode(rows.get(i)));
                return result;
            }
            return decodeObject(object);
        }
        if(encoded instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(value->result.add(decode(value)));return result;}
        return encoded.deepCopy();
    }
    private ObjectNode decodeObject(ObjectNode object){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,decode(object.get(key)));return result;}
    private List<JsonNode> expand(JsonNode data,int count) {
        var rows=new ArrayList<JsonNode>();
        if(data.isArray())data.forEach(value->rows.add(value.deepCopy()));
        else if(data.isObject()&&data.size()==1&&data.has("=")){for(int i=0;i<count;i++)rows.add(data.get("=").deepCopy());}
        else if(data.isObject()&&data.size()==1&&data.has("#")) {
            var pair=pair(data.get("#"));if(!pair.get(0).isArray()||!pair.get(1).isArray())throw invalid();
            for(var ref:pair.get(1)){int index=integer(ref);if(index>=pair.get(0).size())throw invalid();rows.add(pair.get(0).get(index).deepCopy());}
        } else if(data.isObject()&&data.size()==1&&data.has("+")) {
            var pair=pair(data.get("+"));if(!pair.get(0).isString())throw invalid();
            for(var suffix:expand(pair.get(1),count)){if(!suffix.isString())throw invalid();rows.add(mapper.getNodeFactory().stringNode(pair.get(0).asString()+suffix.asString()));}
        } else if(data.isObject()&&data.has("f")&&Set.of("f","r").containsAll(data.propertyNames())) {
            if(!(data.get("f") instanceof ObjectNode fields))throw invalid();
            for(int i=0;i<count;i++)rows.add(mapper.createObjectNode());
            for(String key:fields.propertyNames()) {
                JsonNode column=fields.get(key);if(column.isObject()&&column.size()==1&&column.has("q"))continue;
                var values=expand(column,count);for(int i=0;i<count;i++)((ObjectNode)rows.get(i)).set(key,values.get(i));
            }
            for(String key:fields.propertyNames()) {
                JsonNode column=fields.get(key);if(!(column.isObject()&&column.size()==1&&column.has("q")))continue;
                var pair=pair(column.get("q"));if(!pair.get(0).isString()||!pair.get(1).isString())throw invalid();
                for(var row:rows){var value=row.get(pair.get(1).asString());if(value==null||!value.isIntegralNumber())throw invalid();((ObjectNode)row).set(key,mapper.getNodeFactory().stringNode(pair.get(0).asString()+value.toString()));}
            }
            if(data.has("r")) {
                var extras=expand(data.get("r"),count);
                for(int i=0;i<count;i++){if(!(extras.get(i) instanceof ObjectNode extra))throw invalid();for(String key:extra.propertyNames()){if(rows.get(i).has(key))throw invalid();((ObjectNode)rows.get(i)).set(key,extra.get(key));}}
            }
        } else if(data.isObject()&&data.size()==1&&data.has("g")) {
            if(!data.get("g").isArray())throw invalid();for(int i=0;i<count;i++)rows.add(null);
            for(var group:data.get("g")){var pair=pair(group);if(!pair.get(0).isArray())throw invalid();var values=expand(pair.get(1),pair.get(0).size());for(int i=0;i<values.size();i++){int position=integer(pair.get(0).get(i));if(position>=count||rows.get(position)!=null)throw invalid();rows.set(position,values.get(i));}}
        } else if(data.isObject()&&data.size()==1&&data.has("i")) {
            if(!data.get("i").isArray())throw invalid();for(int i=0;i<count;i++)rows.add(mapper.createArrayNode());
            for(var item:data.get("i")){var values=expand(item,count);for(int i=0;i<count;i++)((ArrayNode)rows.get(i)).add(values.get(i));}
        } else throw invalid();
        if(rows.size()!=count||rows.contains(null))throw invalid();return rows;
    }
    private ArrayNode pair(JsonNode node){if(!(node instanceof ArrayNode array)||array.size()!=2)throw invalid();return array;}
    private int integer(JsonNode value){if(!value.isIntegralNumber()||value.asInt()<0||!Integer.toString(value.asInt()).equals(value.toString()))throw invalid();return value.asInt();}
    private IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_FINAL_SOURCE_COLUMNS");}
    private List<JsonNode> values(JsonNode node){var result=new ArrayList<JsonNode>();node.forEach(result::add);return result;}
    private ArrayNode array(JsonNode...values){var result=mapper.createArrayNode();for(var value:values)result.add(value);return result;}
    private ObjectNode object(String key,JsonNode value){return mapper.createObjectNode().set(key,value);}
    private int tokens(JsonNode value){return tokenCounts.computeIfAbsent(value.toString(),QwenTokenCounter::count);}
    private JsonNode best(JsonNode original,JsonNode candidate){return tokens(candidate)<tokens(original)?candidate:original;}
}
