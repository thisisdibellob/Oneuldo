package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Shares exact numeric prefixes/suffixes by text concatenation, with no numeric computation. */
public final class AdaptiveNumericFragments {
    public static final String FIELD="adaptiveNumberPrefixes",RULE_FIELD="adaptiveNumberPrefixRule";
    public static final String SUFFIX_FIELD="adaptiveNumberSuffixes";
    public static final String RULE="$nf:[참조,길이,접미]=숫자원문 배열. adaptiveNumberPrefixes:[길이문자열,접두원문]은 접두사전. 모든 길이는 @=0,A..Z=1..26(정수=공통길이), 참조 A..Z,a..z=0..51. 순서대로 원문을 잘라 접두+접미 그대로 이어 JSON number로 복원한다. $nfl:{...}=예약키 원본객체. 계산·반올림·ID치환 없이 숫자 표기·타입·순서 보존.";
    public static final String SUFFIX_RULE="$nf=[prefixRefs,widths,text] or [prefixRefs,suffixRefs,widths,text]. adaptiveNumberPrefixes and adaptiveNumberSuffixes are [widths,concatenated literal fragments]. Refs A..Z,a..z=0..51. Widths @=0,A..Z=1..26; integer=common width. Split in order; concatenate prefix+text(+suffix) exactly; parse JSON numbers. $nfl:{...} escapes the original object. Preserve numeric text/types/order/IDs; no arithmetic.";
    private static final String ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private final ObjectMapper mapper;
    private final Map<String,Integer> numbers=new LinkedHashMap<>();
    private final List<String> prefixes=new ArrayList<>();
    private final List<String> suffixes=new ArrayList<>();
    private final boolean allowSuffixes;
    private boolean used,suffixUsed;
    public AdaptiveNumericFragments(ObjectMapper mapper){this(mapper,false);}
    public AdaptiveNumericFragments(ObjectMapper mapper,boolean allowSuffixes){this.mapper=mapper;this.allowSuffixes=allowSuffixes;prefixes.add("");suffixes.add("");}
    public ObjectNode encode(ObjectNode source){
        if(source.has(FIELD)||source.has(RULE_FIELD)||source.has(SUFFIX_FIELD))return source.deepCopy();
        count(source);select(numbers,prefixes);
        if(allowSuffixes){var reversed=new LinkedHashMap<String,Integer>();for(var entry:numbers.entrySet()){String remaining=entry.getKey().substring(prefixes.get(bestPrefix(entry.getKey())).length());reversed.merge(new StringBuilder(remaining).reverse().toString(),entry.getValue(),Integer::sum);}select(reversed,suffixes);for(int i=0;i<suffixes.size();i++)suffixes.set(i,new StringBuilder(suffixes.get(i)).reverse().toString());}
        var result=(ObjectNode)value(source);
        if(used){result.set(FIELD,dictionary(prefixes));result.put(RULE_FIELD,suffixUsed?SUFFIX_RULE:RULE);if(suffixUsed)result.set(SUFFIX_FIELD,dictionary(suffixes));}
        return result;
    }
    private ArrayNode dictionary(List<String> values){var lengths=new StringBuilder();var text=new StringBuilder();for(String value:values){lengths.append((char)('@'+value.length()));text.append(value);}return mapper.createArrayNode().add(lengths.toString()).add(text.toString());}
    private boolean numeric(ArrayNode array){
        if(array.size()<6)return false;
        for(var number:array){
            if(!number.isNumber())return false;String text=number.toString();
            if(text.length()>26||!text.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))return false;
            var parsed=mapper.readTree(text);if(!parsed.toString().equals(text)||!parsed.getClass().equals(number.getClass()))return false;
        }
        return true;
    }
    private void count(JsonNode node){
        if(node instanceof ArrayNode array&&numeric(array)){array.forEach(number->numbers.merge(number.toString(),1,Integer::sum));return;}
        if(node.isObject()||node.isArray())node.forEach(this::count);
    }
    private int bestPrefix(String text){return bestPrefix(text,prefixes);}
    private static int bestPrefix(String text,List<String> values){int best=0;for(int i=1;i<values.size();i++)if(text.startsWith(values.get(i))&&values.get(i).length()>values.get(best).length())best=i;return best;}
    private int bestSuffix(String text,int prefixLength){int best=0;for(int i=1;i<suffixes.size();i++)if(suffixes.get(i).length()<=text.length()-prefixLength&&text.endsWith(suffixes.get(i))&&suffixes.get(i).length()>suffixes.get(best).length())best=i;return best;}
    private void select(Map<String,Integer> numbers,List<String> prefixes){
        var candidates=new TreeSet<String>();for(String text:numbers.keySet())for(int length=2;length<=Math.min(18,text.length());length++)candidates.add(text.substring(0,length));
        var costs=new HashMap<String,Integer>();for(String prefix:candidates)costs.put(prefix,QwenTokenCounter.count(mapper.valueToTree(prefix).toString())+3);
        while(prefixes.size()<52){
            var savings=new HashMap<String,Integer>();var uses=new HashMap<String,Integer>();
            for(var entry:numbers.entrySet()){
                String text=entry.getKey();int previous=prefixes.get(bestPrefix(text,prefixes)).length();
                for(int length=Math.max(2,previous+1);length<=Math.min(18,text.length());length++){
                    String prefix=text.substring(0,length);if(candidates.contains(prefix)){savings.merge(prefix,(length-previous)*entry.getValue(),Integer::sum);uses.merge(prefix,entry.getValue(),Integer::sum);}
                }
            }
            String best=null;int bestScore=8;
            for(String prefix:candidates){
                int score=savings.getOrDefault(prefix,0)-costs.get(prefix);
                if(uses.getOrDefault(prefix,0)>=2&&score>bestScore){best=prefix;bestScore=score;}
            }
            if(best==null)break;prefixes.add(best);candidates.remove(best);
        }
    }
    private JsonNode value(JsonNode node){
        if(node instanceof ArrayNode array){
            if(numeric(array)){
                var packed=pack(array,false);boolean dual=false;
                if(allowSuffixes){var candidate=pack(array,true);if(QwenTokenCounter.count(candidate.toString())<QwenTokenCounter.count(packed.toString())){packed=candidate;dual=true;}}
                var plain=mapper.createObjectNode().set("values",array);var concatenated=new AdaptiveNumericColumnText(mapper).encode(plain).get("values");
                if(QwenTokenCounter.count(packed.toString())<QwenTokenCounter.count(concatenated.toString())){used=true;if(dual)suffixUsed=true;return packed;}
            }
            var result=mapper.createArrayNode();array.forEach(item->result.add(value(item)));return result;
        }
        if(node instanceof ObjectNode object){var result=mapper.createObjectNode();for(String key:object.propertyNames())result.set(key,value(object.get(key)));if(object.has("$nf")||object.has("$nfl")){used=true;return mapper.createObjectNode().set("$nfl",result);}return result;}
        return node.deepCopy();
    }
    private ObjectNode pack(ArrayNode array,boolean dual){
        var refs=new StringBuilder();var suffixRefs=new StringBuilder();var widths=new StringBuilder();var text=new StringBuilder();int common=-1;
        for(var number:array){String literal=number.toString();int index=bestPrefix(literal),prefixLength=prefixes.get(index).length(),suffixIndex=dual?bestSuffix(literal,prefixLength):0;String middle=literal.substring(prefixLength,literal.length()-suffixes.get(suffixIndex).length());refs.append(ALPHABET.charAt(index));suffixRefs.append(ALPHABET.charAt(suffixIndex));widths.append((char)('@'+middle.length()));text.append(middle);if(common==-1)common=middle.length();else if(common!=middle.length())common=-2;}
        var data=mapper.createArrayNode().add(refs.toString());if(dual)data.add(suffixRefs.toString());if(common>=0)data.add(common);else data.add(widths.toString());data.add(text.toString());return mapper.createObjectNode().set("$nf",data);
    }
    public static ObjectNode decode(ObjectMapper mapper,ObjectNode source){
        String rule=source.path(RULE_FIELD).asString();if(!Set.of(RULE,SUFFIX_RULE).contains(rule)||source.has(SUFFIX_FIELD)!=SUFFIX_RULE.equals(rule))throw invalid();
        var prefixes=readDictionary(mapper,source.path(FIELD));var suffixes=source.has(SUFFIX_FIELD)?readDictionary(mapper,source.get(SUFFIX_FIELD)):null;
        var copy=source.deepCopy();copy.remove(List.of(FIELD,RULE_FIELD,SUFFIX_FIELD));return (ObjectNode)restore(mapper,copy,prefixes,suffixes);
    }
    private static ArrayNode readDictionary(ObjectMapper mapper,JsonNode encoded){
        if(!encoded.isArray()||encoded.size()!=2||!encoded.get(0).isString()||!encoded.get(1).isString())throw invalid();
        String lengths=encoded.get(0).asString(),text=encoded.get(1).asString();if(lengths.isEmpty()||lengths.length()>52)throw invalid();
        var prefixes=mapper.createArrayNode();int offset=0;for(int i=0;i<lengths.length();i++){int length=lengths.charAt(i)-'@';if(length<0||length>26||offset+length>text.length())throw invalid();prefixes.add(text.substring(offset,offset+length));offset+=length;}
        if(offset!=text.length()||!prefixes.get(0).asString().isEmpty())throw invalid();
        return prefixes;
    }
    private static JsonNode restore(ObjectMapper mapper,JsonNode node,JsonNode prefixes,JsonNode suffixes){
        if(node instanceof ObjectNode object){
            if(object.size()==1&&object.has("$nfl")){if(!(object.get("$nfl") instanceof ObjectNode literal))throw invalid();return restoreObject(mapper,literal,prefixes,suffixes);}
            if(object.size()==1&&object.has("$nf")){
                var data=object.get("$nf");if(!data.isArray()||!Set.of(3,4).contains(data.size())||!data.get(0).isString()||!data.get(data.size()-1).isString())throw invalid();boolean dual=data.size()==4;
                if(dual&&(suffixes==null||!data.get(1).isString()||data.get(1).asString().length()!=data.get(0).asString().length()))throw invalid();
                String refs=data.get(0).asString(),text=data.get(data.size()-1).asString();var widths=data.get(data.size()-2);if(!widths.isString()&&!widths.isIntegralNumber())throw invalid();
                if(widths.isIntegralNumber()&&(!widths.canConvertToInt()||widths.asInt()<0||widths.asInt()>26)||widths.isString()&&widths.asString().length()!=refs.length())throw invalid();
                var result=mapper.createArrayNode();int offset=0;
                for(int i=0;i<refs.length();i++){
                    int index=ALPHABET.indexOf(refs.charAt(i)),length=widths.isIntegralNumber()?widths.asInt():widths.asString().charAt(i)-'@';
                    if(index<0||index>=prefixes.size()||length<0||length>26||offset+length>text.length())throw invalid();
                    int suffixIndex=dual?ALPHABET.indexOf(data.get(1).asString().charAt(i)):0;if(dual&&(suffixIndex<0||suffixIndex>=suffixes.size()))throw invalid();
                    String literal=prefixes.get(index).asString()+text.substring(offset,offset+length)+(dual?suffixes.get(suffixIndex).asString():"");
                    if(!literal.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))throw invalid();var number=mapper.readTree(literal);if(!number.isNumber()||!number.toString().equals(literal))throw invalid();result.add(number);offset+=length;
                }
                if(offset!=text.length())throw invalid();return result;
            }
            return restoreObject(mapper,object,prefixes,suffixes);
        }
        if(node instanceof ArrayNode array){var result=mapper.createArrayNode();array.forEach(item->result.add(restore(mapper,item,prefixes,suffixes)));return result;}
        return node.deepCopy();
    }
    private static ObjectNode restoreObject(ObjectMapper mapper,ObjectNode node,JsonNode prefixes,JsonNode suffixes){var result=mapper.createObjectNode();for(String key:node.propertyNames())result.set(key,restore(mapper,node.get(key),prefixes,suffixes));return result;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_ADAPTIVE_NUMBER_PREFIXES");}
}
