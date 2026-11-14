package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import java.security.MessageDigest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SeoyeonGenerationTransportTest {
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    private static final Path OWN=Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-3");

    @Test void diagnose_the_exact_26032_request_using_only_the_own_seoyeon_fixture() throws Exception {
        var fixture=mapper.readTree(Files.readString(OWN.resolve("generation-failure-original.json")));
        var failed=fixture.path("attempts").get(13).path("validationDetails");
        String system=failed.path("systemPrompt").asString(),prompt=failed.path("submittedPrompt").asString();
        var wire=(ObjectNode)mapper.readTree(prompt);
        var source=AdaptiveQuestTransport.decode(mapper,wire);
        var improved=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        var restored=AdaptiveQuestTransport.decode(mapper,(ObjectNode)mapper.readTree(improved.toString()));
        assertThat(restored).isEqualTo(source);
        assertThat(signature(restored)).isEqualTo(signature(source));
        assertThat(hash(canonical(restored).toString())).isEqualTo(hash(canonical(source).toString()));
        int improvedRequired=QwenTokenCounter.inputTokens(system,improved.toString())+2632;
        var legacy=legacyGeneration(source);
        int legacyRequired=QwenTokenCounter.inputTokens(system,legacy.toString())+2632;
        assertThat(improvedRequired).isLessThanOrEqualTo(legacyRequired);
        System.out.println("OWN_CANDIDATE_REQUIRED="+improvedRequired+" VERSION="+improved.path("adaptiveTransportVersion"));
        int required=QwenTokenCounter.inputTokens(system,prompt)+2600+32;
        assertThat(required).isEqualTo(26032);
        var report=mapper.createObjectNode().put("execution","OWN_SOURCE_BPE_DIAGNOSTIC_ONLY")
                .put("actualModelCalls",0).put("newPlays",0).put("originalRequiredTokens",required)
                .put("reservedGenerationOutput",2600).put("margin",32).put("inputTokensWithSystem",required-2632)
                .put("systemStandaloneTokens",QwenTokenCounter.count(system)).put("promptStandaloneTokens",QwenTokenCounter.count(prompt));
        report.put("legacyV72ReencodedRequiredTokens",legacyRequired).put("improvedRequiredTokens",improvedRequired).put("limitTokens",24000).put("newPromptStandaloneTokens",QwenTokenCounter.count(improved.toString()))
                .put("exactSourceHash",hash(canonical(source).toString())).put("restoredSourceHash",hash(canonical(restored).toString()))
                .put("selectedVersion",improved.path("adaptiveTransportVersion").asString())
                .put("numericPrefixesUsed",improved.has(AdaptiveNumericFragments.RULE_FIELD)).put("objectTemplatesUsed",improved.has(AdaptiveObjectTuples.RULE_FIELD))
                .put("numericSuffixesUsed",improved.has(AdaptiveNumericFragments.SUFFIX_FIELD))
                .put("originalFixtureHash",hash(Files.readString(OWN.resolve("generation-failure-original.json"))));
        var fieldRows=report.putArray("encodedRootFields");
        for(String field:wire.propertyNames())fieldRows.addObject().put("field",field).put("standaloneTokens",QwenTokenCounter.count(wire.path(field).toString()))
                .put("chars",wire.path(field).toString().length()).put("entries",wire.path(field).size());
        var sourceRows=report.putArray("decodedSourceFields");
        for(String field:source.propertyNames())sourceRows.addObject().put("field",field).put("standaloneTokens",QwenTokenCounter.count(source.path(field).toString()))
                .put("chars",source.path(field).toString().length()).put("entries",source.path(field).size());
        var largeParts=report.putArray("encodedLargeSubfields");
        large(wire,"",0,largeParts);
        var stockRows=report.putArray("preservedOriginalStockObjects");stock(source,"",stockRows);
        report.put("catalogProductCount",source.path("catalog").size()).put("practiceHistoryCount",source.path("practiceHistory").size())
                .put("preservedScalarAndArrayPathCount",signature(source).size());
        var dictionaryRows=report.putArray("largestDictionaryItems");
        for(String field:List.of("finalSourceShared","adaptiveSharedOriginalObjects")) {
            var items=new ArrayList<Map.Entry<String,JsonNode>>();
            var dictionary=wire.path(field);
            if(dictionary.isObject())for(String key:dictionary.propertyNames())items.add(Map.entry(key,dictionary.get(key)));
            else if(dictionary.isArray())for(int i=0;i<dictionary.size();i++)items.add(Map.entry(Integer.toString(i),dictionary.get(i)));
            items.stream().sorted(Comparator.<Map.Entry<String,JsonNode>>comparingInt(entry->QwenTokenCounter.count(entry.getValue().toString())).reversed())
                    .limit(15).forEach(entry->dictionaryRows.addObject().put("field",field).put("index",entry.getKey())
                            .put("tokens",QwenTokenCounter.count(entry.getValue().toString())).put("valueType",entry.getValue().getNodeType().name())
                            .put("keys",entry.getValue().isObject()?entry.getValue().propertyNames().toString():""));
        }
        var output=OWN.resolve("diagnostics");Files.createDirectories(output);
        Files.writeString(output.resolve("generation-26032-bpe-diagnostic.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        Files.writeString(output.resolve("generation-lossless-transport-probe.json"),improved.toString());
        System.out.println("OWN_REQUIRED_TOKENS="+required+" SOURCE_ROOT_FIELDS="+source.propertyNames());
        assertThat(improvedRequired).isLessThanOrEqualTo(24000);
        assertThat(hash(Files.readString(OWN.resolve("generation-failure-original.json")))).isEqualTo("8547224277465d9a7dd22e444b37c0d269d9ef951d4240cb68cefa51a94a6d70");
    }

    @Test void exact_numeric_prefix_concatenation_preserves_typed_edge_literals_and_rejects_malformed_data(){
        var wire=mapper.createObjectNode().put(AdaptiveNumericFragments.RULE_FIELD,AdaptiveNumericFragments.RULE);
        wire.set(AdaptiveNumericFragments.FIELD,numericDictionary(List.of("","-","1","1234567890123456789","0")));
        wire.set("values",mapper.createObjectNode().set("$nf",mapper.readTree("[\"BCCDEA\",\"C@B@BF\",\"0.0.0.01.0E-8\"]")));
        var expected=mapper.readTree("[-0.0,1,1.0,1234567890123456789,0.0,1.0E-8]");
        var actual=AdaptiveNumericFragments.decode(mapper,(ObjectNode)mapper.readTree(wire.toString())).get("values");
        assertThat(mapper.writeValueAsBytes(actual)).isEqualTo(mapper.writeValueAsBytes(expected));
        for(int i=0;i<expected.size();i++)assertThat(actual.get(i).getClass()).isEqualTo(expected.get(i).getClass());
        for(String malformed:List.of("[\"z\",0,\"\"]","[\"A\",27,\"1\"]","[\"A\",\"a\",\"1\"]","[\"A\",\"\",\"1\"]","[\"A\",2,\"01\"]","[\"A\",3,\"1\"]","[\"C\",0,\"extra\"]","[\"A\",3,\"NaN\"]")){
            var bad=wire.deepCopy();bad.set("values",mapper.createObjectNode().set("$nf",mapper.readTree(malformed)));
            assertThatThrownBy(()->AdaptiveNumericFragments.decode(mapper,bad)).hasMessage("INVALID_ADAPTIVE_NUMBER_PREFIXES");
        }
        var badRule=wire.deepCopy();badRule.put(AdaptiveNumericFragments.RULE_FIELD,"unknown");
        assertThatThrownBy(()->AdaptiveNumericFragments.decode(mapper,badRule)).hasMessage("INVALID_ADAPTIVE_NUMBER_PREFIXES");
        var dual=wire.deepCopy().put(AdaptiveNumericFragments.RULE_FIELD,AdaptiveNumericFragments.SUFFIX_RULE);
        dual.set(AdaptiveNumericFragments.SUFFIX_FIELD,numericDictionary(List.of("",".0","E-8")));
        dual.set("values",mapper.createObjectNode().set("$nf",mapper.readTree("[\"BCCDEC\",\"BABABC\",\"A@@@@B\",\"0.0\"]")));
        assertThat(mapper.writeValueAsBytes(AdaptiveNumericFragments.decode(mapper,dual).get("values"))).isEqualTo(mapper.writeValueAsBytes(expected));
        for(String malformed:List.of("[\"C\",\"z\",0,\"\"]","[\"CC\",\"A\",0,\"\"]","[\"A\",\"A\",2,\"00\"]")){
            var bad=dual.deepCopy();bad.set("values",mapper.createObjectNode().set("$nf",mapper.readTree(malformed)));
            assertThatThrownBy(()->AdaptiveNumericFragments.decode(mapper,bad)).hasMessage("INVALID_ADAPTIVE_NUMBER_PREFIXES");
        }
    }

    @Test void numeric_prefixes_and_object_templates_escape_original_markers_and_restore_every_value_type(){
        var source=mapper.createObjectNode();var rows=source.putArray("rows");
        for(int i=0;i<80;i++)rows.addObject().put("originalLongPropertyName",i%2==0?123456789012345L:123456789012346L)
                .set("sameOrderedPropertyName",mapper.readTree("[null,false,0,1.0,\"\",\"E87\",\"^\",\"~\",\"$nf\"]"));
        var values=source.putArray("values");for(int i=0;i<100;i++)values.add(i%2==0?123456789012345L:123456789012346L);
        source.set("reserved",mapper.readTree("{\"$nf\":[\"A\",1,\"1\"],\"nested\":{\"$nfl\":{\"literal\":true}},\"array\":[\"A\",2,\"unparsed\"],\"other\":[\"~\",[null,false,0]],\"matrixLiteral\":[\"#\",[\"fake\"],[123]]}"));
        var prefixed=new AdaptiveNumericFragments(mapper).encode(source);
        assertThat(prefixed.has(AdaptiveNumericFragments.RULE_FIELD)).isTrue();
        var tuples=new AdaptiveObjectTuples(mapper).encode(prefixed);
        assertThat(tuples.has(AdaptiveObjectTuples.RULE_FIELD)).isTrue();
        var decoded=AdaptiveNumericFragments.decode(mapper,AdaptiveObjectTuples.decode(mapper,(ObjectNode)mapper.readTree(tuples.toString())));
        assertThat(mapper.writeValueAsBytes(decoded)).isEqualTo(mapper.writeValueAsBytes(source));
    }

    @Test void invalid_object_templates_cannot_erase_duplicate_keys_change_value_count_or_use_unknown_codes(){
        for(String keys:List.of("[[\"duplicate\",\"duplicate\"]]","[[1]]","[[]]")){
            var bad=mapper.createObjectNode().put(AdaptiveObjectTuples.RULE_FIELD,AdaptiveObjectTuples.RULE);
            bad.set(AdaptiveObjectTuples.FIELD,mapper.readTree(keys));
            assertThatThrownBy(()->AdaptiveObjectTuples.decode(mapper,bad)).hasMessage("INVALID_ADAPTIVE_OBJECT_KEYS");
        }
        for(String value:List.of("[\"z\",0]","[\"B\",0]","[\"A\"]","[\"A\",0,1]","[\"~\",0]","[\"#\",[\"same\",\"same\"],[0,1]]","[\"#\",[\"key\"],[]]")){
            var bad=mapper.createObjectNode().put(AdaptiveObjectTuples.RULE_FIELD,AdaptiveObjectTuples.RULE);
            bad.set(AdaptiveObjectTuples.FIELD,mapper.readTree("[[\"name\"]]"));bad.set("values",mapper.readTree(value));
            assertThatThrownBy(()->AdaptiveObjectTuples.decode(mapper,bad)).hasMessage("INVALID_ADAPTIVE_OBJECT_KEYS");
        }
    }

    @Test void default_v5_and_metadata_collisions_keep_the_original_observation_review_contract(){
        var source=(ObjectNode)mapper.readTree("{\"adaptiveNumberPrefixRule\":\"original\",\"adaptiveObjectKeyRule\":\"original\",\"adaptiveGenerationBaseVersion\":null,\"adaptiveNumberPrefixes\":[\"~\"],\"adaptiveNumberSuffixes\":null,\"adaptiveObjectKeys\":[\"^\"],\"rows\":[{\"id\":\"E2\",\"quantity\":2},{\"id\":\"E1\",\"quantity\":1.0}]}" );
        var v5=AdaptiveQuestTransport.encode(mapper,source);
        assertThat(v5.path("adaptiveTransportVersion").asString()).isEqualTo("shared-environment-v5");
        assertThat(AdaptiveQuestTransport.decode(mapper,v5)).isEqualTo(source);
        var generation=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        assertThat(generation.path("adaptiveTransportVersion").asString()).isNotEqualTo("shared-environment-v7-exact-templates");
        assertThat(AdaptiveQuestTransport.decode(mapper,generation)).isEqualTo(source);
        assertThat(mapper.writeValueAsBytes(AdaptiveQuestTransport.encode(mapper,source))).isEqualTo(mapper.writeValueAsBytes(v5));
    }

    @Test void generation_opt_in_never_increases_the_prior_v72_full_envelope_bpe_cost_for_synthetic_sources(){
        for(String raw:List.of("{\"empty\":[],\"null\":null,\"zero\":0,\"flag\":false,\"text\":\"\"}","{\"id\":\"E87\",\"ids\":[\"E4\",\"E2\",\"E1\"],\"numbers\":[0,1,1.0,-0.0,1.0E-8,1234567890123456789]}","{\"markers\":[\"^\",2,\"~\"],\"object\":{\"$nf\":[\"A\",1,\"1\"]}}")){
            var source=(ObjectNode)mapper.readTree(raw);var old=legacyGeneration(source);var improved=AdaptiveQuestTransport.encodeGeneration(mapper,source);
            assertThat(QwenTokenCounter.count(improved.toString())).isLessThanOrEqualTo(QwenTokenCounter.count(old.toString()));
            assertThat(signature(AdaptiveQuestTransport.decode(mapper,(ObjectNode)mapper.readTree(improved.toString())))).isEqualTo(signature(source));
        }
    }
    private void large(JsonNode node,String path,int depth,tools.jackson.databind.node.ArrayNode report) {
        if(depth>7)return;
        if(node.isObject()) for(String key:node.propertyNames()) {
            var value=node.get(key);int cost=QwenTokenCounter.count(value.toString());
            if(cost>400)report.addObject().put("path",path+"/"+key).put("standaloneTokens",cost).put("chars",value.toString().length());
            if(cost>400)large(value,path+"/"+key,depth+1,report);
        } else if(node.isArray()&&node.size()<6)for(int i=0;i<node.size();i++)large(node.get(i),path+"/"+i,depth+1,report);
    }
    private void stock(JsonNode node,String path,tools.jackson.databind.node.ArrayNode rows){
        if(node.isObject())for(String key:node.propertyNames()){
            if(List.of("initialStock","stock","stockOverrides").contains(key)&&node.get(key).isObject())rows.addObject().put("path",path+"/"+key).put("originalEntryCount",node.get(key).size());
            stock(node.get(key),path+"/"+key,rows);
        }else if(node.isArray())for(int i=0;i<node.size();i++)stock(node.get(i),path+"/"+i,rows);
    }
    private Map<String,String> signature(JsonNode source){var result=new TreeMap<String,String>();signature(source,"",result);return result;}
    private void signature(JsonNode node,String path,Map<String,String> result){
        if(node.isObject()){for(String key:node.propertyNames())signature(node.get(key),path+"/"+key.replace("~","~0").replace("/","~1"),result);}
        else if(node.isArray()){result.put(path,"ARRAY:"+node.size());for(int i=0;i<node.size();i++)signature(node.get(i),path+"/"+i,result);}
        else result.put(path,node.getClass().getSimpleName()+":"+node.toString());
    }
    private JsonNode canonical(JsonNode node){
        if(node.isObject()){var result=mapper.createObjectNode();var names=new TreeSet<String>();node.propertyNames().forEach(names::add);for(String key:names)result.set(key,canonical(node.get(key)));return result;}
        if(node.isArray()){var result=mapper.createArrayNode();node.forEach(item->result.add(canonical(item)));return result;}return node.deepCopy();
    }
    private String hash(String text)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
    private JsonNode numericDictionary(List<String> prefixes){var lengths=new StringBuilder();var text=new StringBuilder();for(String prefix:prefixes){lengths.append((char)('@'+prefix.length()));text.append(prefix);}return mapper.createArrayNode().add(lengths.toString()).add(text.toString());}
    private ObjectNode legacyGeneration(ObjectNode source){
        var best=AdaptiveQuestTransport.encode(mapper,source);int cost=QwenTokenCounter.count(best.toString());
        var numerical=new AdaptiveNumericColumnText(mapper).encode(best);int tokens=QwenTokenCounter.count(numerical.toString());if(tokens<cost){best=numerical;cost=tokens;}
        for(int minimum:List.of(24,48,72,128)){
            var original=new AdaptiveOriginalObjectSharing(mapper,minimum).encode(source);if(!original.has(AdaptiveOriginalObjectSharing.DICTIONARY))continue;
            var candidate=AdaptiveQuestTransport.encode(mapper,original);candidate.put("adaptiveTransportVersion","shared-environment-v6-original-objects").put(AdaptiveOriginalObjectSharing.RULE_FIELD,AdaptiveOriginalObjectSharing.RULE);
            numerical=new AdaptiveNumericColumnText(mapper).encode(candidate);tokens=QwenTokenCounter.count(candidate.toString());if(tokens<cost){best=candidate;cost=tokens;}
            tokens=QwenTokenCounter.count(numerical.toString());if(tokens<cost){best=numerical;cost=tokens;}
        }return best;
    }
}
