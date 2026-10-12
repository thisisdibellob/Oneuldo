package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import java.security.MessageDigest;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class AdaptiveQuestGenerationSharedSourceTest {
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    private static final Path ACTUAL=Path.of("../output/persona45-mcp-20261013/adult-minjae-unit-support-research-v2-1/recommendation-1/v71-stage-cee9dbde-4a8e-4205-9f2f-7a776c5802ef-18.json");
    @Test void diagnose_only_exact_repeated_subtrees_of_the_actual_submitted_prompt() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(ACTUAL));
        String prompt=mapper.readTree(Files.readString(ACTUAL)).at("/validationDetails/submittedPrompt").asString();
        var source=AdaptiveQuestTransport.decode(mapper,mapper.readTree(prompt));
        assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,source))).isEqualTo(source);
        Map<JsonNode,List<String>> paths=new HashMap<>();count(source,"",paths);
        var report=mapper.createArrayNode();
        paths.entrySet().stream().filter(entry->entry.getValue().size()>1)
                .sorted(Comparator.<Map.Entry<JsonNode,List<String>>>comparingInt(entry->(entry.getValue().size()-1)*QwenTokenCounter.count(entry.getKey().toString())).reversed())
                .limit(30).forEach(entry->{var row=report.addObject().put("copies",entry.getValue().size()).put("literalTokens",QwenTokenCounter.count(entry.getKey().toString()));row.set("paths",mapper.valueToTree(entry.getValue()));});
        var out=ACTUAL.resolveSibling("transport-duplicate-diagnostic.json");Files.writeString(out,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        System.out.println("ACTUAL_SUBTREE_TOKEN_DIAGNOSTICS="+report);
        var kinds=mapper.createObjectNode();
        for(var row:source.path("recordedEvidence").path("navigationContext").path("sessions").get(0).path("movementEventDetails"))
            if(!kinds.has(row.path("eventCode").asString()))kinds.set(row.path("eventCode").asString(),mapper.valueToTree(row.propertyNames()));
        var points=mapper.createArrayNode();
        paths.entrySet().stream().filter(entry->entry.getKey().isObject()&&entry.getValue().size()>1
                &&entry.getKey().propertyNames().stream().anyMatch(key->List.of("x","y","position","startPosition","endPosition").contains(key)))
                .forEach(entry->{var row=points.addObject().put("copies",entry.getValue().size()).put("literalTokens",QwenTokenCounter.count(entry.getKey().toString()));row.set("paths",mapper.valueToTree(entry.getValue()));});
        Files.writeString(ACTUAL.resolveSibling("transport-point-diagnostic.json"),mapper.writeValueAsString(Map.of("eventShapes",kinds,"repeatedPointObjects",points)));
        var optimized=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        var restored=AdaptiveQuestTransport.decode(mapper,optimized);
        assertThat(restored).isEqualTo(source);
        var baselineRestored=AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,source));
        var numericOnly=new AdaptiveNumericColumnText(mapper).encode(AdaptiveQuestTransport.encode(mapper,source));
        String system=AdaptiveMarketQuestService.GENERATION_SYSTEM+" Required objective count is exactly "+source.path("requiredItemCount").asInt()+" and difficulty exactly "+source.path("requiredDifficulty").asInt()+". Example/schema values are not default decisions. Make explicit choices from source and constraints.";
        var locked=source.path("currentEnvironment").path("runtimeContext").path("lockedSettings");
        if(locked.isObject()&&!locked.isEmpty())system+=" REQUIRED USER SETTINGS (exact JSON pointer values): "+locked+". These override previous practice choices. Explain their actual application without claiming they were previously observed.";
        int before=QwenTokenCounter.inputTokens(system,prompt)+2600+32;
        int after=QwenTokenCounter.inputTokens(system,optimized.toString())+2600+32;
        var budget=new LinkedHashMap<String,Object>();budget.put("beforeRequiredTokens",before);budget.put("afterRequiredTokens",after);budget.put("limit",24000);
        budget.put("exactObjectRoundtrip",true);budget.put("sameSerializedBytes",Arrays.equals(mapper.writeValueAsBytes(source),mapper.writeValueAsBytes(restored)));
        budget.put("v5BaselineSameSerializedBytes",Arrays.equals(mapper.writeValueAsBytes(source),mapper.writeValueAsBytes(baselineRestored)));
        budget.put("numericOnlyRequiredTokens",QwenTokenCounter.inputTokens(system,numericOnly.toString())+2600+32);
        budget.put("numericOnlyMatchesV5SerializedBytes",Arrays.equals(mapper.writeValueAsBytes(baselineRestored),mapper.writeValueAsBytes(AdaptiveQuestTransport.decode(mapper,numericOnly))));
        budget.put("transportVersion",optimized.path("adaptiveTransportVersion").asString());
        Files.writeString(ACTUAL.resolveSibling("generation-shared-object-probe.json"),mapper.writeValueAsString(budget));
        System.out.println("SHARED_OBJECT_PROBE="+budget);
    }
    @Test void actual_25088_generation_fits_without_changing_any_source_number_literal_id_event_or_list_order() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(ACTUAL));
        byte[] rawBefore=Files.readAllBytes(ACTUAL);
        String prompt=mapper.readTree(rawBefore).at("/validationDetails/submittedPrompt").asString();
        var source=AdaptiveQuestTransport.decode(mapper,mapper.readTree(prompt));
        var before=source.deepCopy();
        var packed=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        var restored=AdaptiveQuestTransport.decode(mapper,mapper.readTree(packed.toString()));
        assertThat(source).isEqualTo(before);assertThat(restored).isEqualTo(source);
        Map<String,String> originalNumbers=new TreeMap<>(),restoredNumbers=new TreeMap<>();
        Map<String,String> originalIds=new TreeMap<>(),restoredIds=new TreeMap<>();
        leaves(source,"",originalNumbers,originalIds);leaves(restored,"",restoredNumbers,restoredIds);
        assertThat(restoredNumbers).isEqualTo(originalNumbers);assertThat(restoredIds).isEqualTo(originalIds);
        assertThat(mapper.writeValueAsBytes(canonical(restored))).isEqualTo(mapper.writeValueAsBytes(canonical(source)));
        for(String field:List.of("recordedEvidence","currentEnvironment","catalog","deepObservation","practiceHistory","profile","progressionContext","outputSchema","readableActions","allowedBehaviorEvidenceIds","allowedMovementEvidenceIds"))
            assertThat(restored.path(field)).as(field).isEqualTo(source.path(field));
        for(var session:source.path("recordedEvidence").path("navigationContext").path("sessions"))
            assertThat(session.path("movementEventDetails")).isNotEmpty();
        assertThat(restored.path("catalog").size()).isEqualTo(source.path("catalog").size());
        String system=system(source);
        int original=QwenTokenCounter.inputTokens(system,prompt)+2600+32;
        int optimized=QwenTokenCounter.inputTokens(system,packed.toString())+2600+32;
        assertThat(original).isEqualTo(25088);assertThat(optimized).isLessThanOrEqualTo(24000);
        assertThat(Files.readAllBytes(ACTUAL)).isEqualTo(rawBefore);
        var proof=Map.of("beforeRequiredTokens",original,"afterRequiredTokens",optimized,"outputTokens",2600,"reserveTokens",32,
                "canonicalOriginalSourceSha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical(source)))),
                "numericLiteralAndIntegralTypeExact",true,"eventIdCodeSequenceAndAllListOrderExact",true,"rawActualFileUnchanged",true,
                "actualModelGenerationVerified",false);
        Files.writeString(ACTUAL.resolveSibling("generation-v72-source-budget-verification.json"),mapper.writeValueAsString(proof));
    }
    @Test void numeric_text_preserves_float_int_negative_zero_exponents_and_reserved_source_objects(){
        var source=mapper.createObjectNode();
        var values=source.putArray("values");
        for(int i=0;i<80;i++)values.add(i%2==0?12345:123456);
        source.set("special",mapper.readTree("[-0.0,0,1.0E-8,0.123456789012345,1234567890123456789,null,false,\"E87\",{\"$nc\":[1,\"1\"]},{\"$ncl\":{\"original\":true}}]"));
        var packed=new AdaptiveNumericColumnText(mapper).encode(source);
        assertThat(packed.has(AdaptiveNumericColumnText.RULE_FIELD)).isTrue();
        assertThat(AdaptiveNumericColumnText.decode(mapper,(ObjectNode)mapper.readTree(packed.toString()))).isEqualTo(source);
        assertThat(mapper.writeValueAsBytes(AdaptiveNumericColumnText.decode(mapper,packed))).isEqualTo(mapper.writeValueAsBytes(source));
        // Explicit typed fixture ensures these edge numbers actually pass through
        // the lexical-number decoder, rather than remaining in a mixed plain array.
        var original=mapper.readTree("[-0.0,0,1.0E-8,0.123456789012345,1234567890123456789]");
        StringBuilder text=new StringBuilder(),widths=new StringBuilder();
        for(var number:original){String literal=number.toString();text.append(literal);widths.append((char)('A'+literal.length()-1));}
        var manual=mapper.createObjectNode().put(AdaptiveNumericColumnText.RULE_FIELD,AdaptiveNumericColumnText.RULE);
        manual.set("numbers",mapper.createObjectNode().set("$nc",mapper.createArrayNode().add(widths.toString()).add(text.toString())));
        var restored=AdaptiveNumericColumnText.decode(mapper,manual).path("numbers");
        assertThat(restored).isEqualTo(original);
        assertThat(mapper.writeValueAsBytes(restored)).isEqualTo(mapper.writeValueAsBytes(original));
    }
    @Test void malformed_number_lengths_literals_and_rules_are_rejected(){
        for(String data:List.of("[0,\"123\"]","[27,\"123\"]","[\"A\",\"12\"]","[\"a\",\"1\"]","[1,\"NaN\"]","[\"C\",\"01.\"]")){
            var packed=mapper.createObjectNode().put(AdaptiveNumericColumnText.RULE_FIELD,AdaptiveNumericColumnText.RULE);
            packed.set("values",mapper.createObjectNode().set("$nc",mapper.readTree(data)));
            assertThatThrownBy(()->AdaptiveNumericColumnText.decode(mapper,packed)).hasMessage("INVALID_ADAPTIVE_NUMERIC_COLUMN_TEXT");
        }
        var invalid=mapper.createObjectNode().put(AdaptiveNumericColumnText.RULE_FIELD,"unknown");
        assertThatThrownBy(()->AdaptiveNumericColumnText.decode(mapper,invalid)).hasMessage("INVALID_ADAPTIVE_NUMERIC_COLUMN_TEXT");
    }
    @Test void generation_opt_in_and_legacy_v5_review_both_restore_all_original_values(){
        var source=mapper.createObjectNode();var rows=source.putArray("rows");
        var shared=mapper.readTree("{\"height\":123.4567890123,\"width\":234.5678901234,\"x\":456.7890123456,\"y\":567.8901234567,\"unknown\":null,\"zero\":0,\"flag\":false,\"eventId\":\"E87\"}");
        for(int i=0;i<20;i++)rows.add(shared.deepCopy());
        source.set("outputSchema",mapper.readTree("{\"preserved\":[null,false,0,\"\"]}"));
        source.set("citedOriginalRecords",mapper.readTree("{\"sameId\":\"E87\",\"sameCode\":\"SHOP.MOVEMENT_STOPPED\",\"sameSequence\":93}"));
        var v5=AdaptiveQuestTransport.encode(mapper,source);assertThat(v5.path("adaptiveTransportVersion").asString()).isEqualTo("shared-environment-v5");
        var generation=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        assertThat(AdaptiveQuestTransport.decode(mapper,generation)).isEqualTo(source);
        assertThat(AdaptiveQuestTransport.decode(mapper,v5)).isEqualTo(source);
        var reReviewed=AdaptiveQuestTransport.encode(mapper,AdaptiveQuestTransport.decode(mapper,generation));
        assertThat(reReviewed.path("adaptiveTransportVersion").asString()).isEqualTo("shared-environment-v5");
        assertThat(reReviewed.has(AdaptiveNumericColumnText.RULE_FIELD)).isFalse();
        assertThat(AdaptiveQuestTransport.decode(mapper,reReviewed)).isEqualTo(source);
    }
    @Test void literal_small_event_ids_do_not_become_sequence_or_index_numbers_and_item_counts_remain_integers(){
        var source=mapper.createObjectNode();var events=source.putObject("recordedEvidence").putArray("sourceEventDetails");
        var expectedIds=List.of("E87","E3","E99","E2","E78","E1");
        int sequence=0;
        for(String id:expectedIds)events.addObject().put("id",id).put("sequence",++sequence).put("eventCode","SHOP.QUANTITY_CHANGED")
                .put("timeMs",12345+sequence*3).put("itemId","synthetic-item").put("quantityBefore",0).put("quantityAfter",2);
        source.putObject("currentEnvironment").put("itemCount",2);
        source.putArray("objectives").addObject().put("productId","synthetic-item").put("quantity",3);
        var indexes=source.putArray("indexes");for(int i=0;i<120;i++)indexes.add(i);
        var old=AdaptiveQuestTransport.encode(mapper,source);
        var generated=AdaptiveQuestTransport.encodeGeneration(mapper,source);
        for(String id:expectedIds){assertThat(old.toString()).contains("\""+id+"\"");assertThat(generated.toString()).contains("\""+id+"\"");}
        var decoded=AdaptiveQuestTransport.decode(mapper,(ObjectNode)mapper.readTree(generated.toString()));
        assertThat(decoded).isEqualTo(source);
        int index=0;for(var row:decoded.path("recordedEvidence").path("sourceEventDetails")){
            assertThat(row.path("id").asString()).isEqualTo(expectedIds.get(index++));
            assertThat(row.path("quantityBefore").isIntegralNumber()).isTrue();assertThat(row.path("quantityAfter").isIntegralNumber()).isTrue();
        }
        assertThat(decoded.at("/objectives/0/quantity").isIntegralNumber()).isTrue();
        assertThat(decoded.at("/currentEnvironment/itemCount").isIntegralNumber()).isTrue();
    }
    @Test void new_generation_object_references_restore_reserved_literals_and_reject_corrupt_references(){
        var source=mapper.createObjectNode();var shapes=source.putArray("shapes");
        var shape=mapper.readTree("{\"x\":0.123456789012345,\"y\":-123.456789012345,\"width\":210.88000000000002,\"height\":90.00000000000001,\"unknown\":null,\"zero\":0,\"flag\":false,\"eventId\":\"E87\"}");
        for(int i=0;i<3;i++)shapes.add(shape.deepCopy());
        source.set("literal",mapper.readTree("{\"$ao\":3,\"nested\":{\"$aol\":{\"raw\":true}}}"));
        var shared=new AdaptiveOriginalObjectSharing(mapper,24).encode(source);
        assertThat(shared.has(AdaptiveOriginalObjectSharing.DICTIONARY)).isTrue();
        var packed=AdaptiveQuestTransport.encode(mapper,shared);
        packed.put("adaptiveTransportVersion","shared-environment-v6-original-objects");
        packed.put(AdaptiveOriginalObjectSharing.RULE_FIELD,AdaptiveOriginalObjectSharing.RULE);
        assertThat(AdaptiveQuestTransport.decode(mapper,packed)).isEqualTo(source);
        var badRule=packed.deepCopy();badRule.put(AdaptiveOriginalObjectSharing.RULE_FIELD,"unknown");
        assertThatThrownBy(()->AdaptiveQuestTransport.decode(mapper,badRule)).hasMessage("INVALID_ADAPTIVE_ORIGINAL_OBJECT_RULE");
        ((ObjectNode)shared.path("shapes").get(0)).put("$ao",999);
        var corrupt=AdaptiveQuestTransport.encode(mapper,shared);
        corrupt.put("adaptiveTransportVersion","shared-environment-v6-original-objects");
        corrupt.put(AdaptiveOriginalObjectSharing.RULE_FIELD,AdaptiveOriginalObjectSharing.RULE);
        assertThatThrownBy(()->AdaptiveQuestTransport.decode(mapper,corrupt)).hasMessage("INVALID_ADAPTIVE_ORIGINAL_OBJECT_REFERENCE");
    }
    private String system(JsonNode source){
        String system=AdaptiveMarketQuestService.GENERATION_SYSTEM+" Required objective count is exactly "+source.path("requiredItemCount").asInt()+" and difficulty exactly "+source.path("requiredDifficulty").asInt()+". Example/schema values are not default decisions. Make explicit choices from source and constraints.";
        var locked=source.path("currentEnvironment").path("runtimeContext").path("lockedSettings");
        if(locked.isObject()&&!locked.isEmpty())system+=" REQUIRED USER SETTINGS (exact JSON pointer values): "+locked+". These override previous practice choices. Explain their actual application without claiming they were previously observed.";
        return system;
    }
    private void leaves(JsonNode node,String path,Map<String,String> numbers,Map<String,String> ids){
        if(node.isNumber())numbers.put(path,(node.isIntegralNumber()?"integer:":"floating:")+node.toString());
        if(node.isString()&&node.asString().matches("E[1-9][0-9]*"))ids.put(path,node.asString());
        if(node.isObject())for(String field:node.propertyNames())leaves(node.path(field),path+"/"+field,numbers,ids);
        else if(node.isArray())for(int i=0;i<node.size();i++)leaves(node.get(i),path+"/"+i,numbers,ids);
    }
    private JsonNode canonical(JsonNode node){
        if(node.isObject()){var result=mapper.createObjectNode();for(String field:new TreeSet<>(node.propertyNames()))result.set(field,canonical(node.path(field)));return result;}
        if(node.isArray()){var result=mapper.createArrayNode();node.forEach(item->result.add(canonical(item)));return result;}
        return node.deepCopy();
    }
    private void count(JsonNode node,String path,Map<JsonNode,List<String>> paths){
        if(node.isObject()||node.isArray()||node.isString())paths.computeIfAbsent(node,key->new ArrayList<>()).add(path);
        if(node.isObject())for(String field:node.propertyNames())count(node.path(field),path+"/"+field,paths);
        else if(node.isArray())for(int index=0;index<node.size();index++)count(node.get(index),path+"/"+index,paths);
    }
}
