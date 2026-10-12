package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import oneuldo.behaviorlog.analysis.service.AnalysisCheckpoints;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class AdaptiveObservationRequestsTest {
    final JsonMapper mapper=JsonMapper.builder().build();
    String report(String id) {
        return "{\"behaviorObservation\":\"장바구니를 열었어요.\",\"movementObservation\":\"기록된 위치를 확인해요.\",\"alternativeExplanations\":[],\"unknowns\":[],\"nextObservationQuestion\":\"다음 선택을 관찰해요.\",\"evidenceIds\":[\""+id+"\"]}";
    }

    @Test void invalid_response_is_preserved_and_model_repairs_against_the_unchanged_source() {
        var audit=new ArrayList<MarketAiQuestGeneration.Attempt>(); var calls=new AtomicInteger();
        String original="{\"events\":[[\"E1\",710.123456789,1350.123456789]]}";
        var requests=new AdaptiveObservationRequests(mapper,(system,prompt,output)->{
            assertThat(prompt).isEqualTo(original);
            if(calls.getAndIncrement()==0) return new GroqChatResult(report("E999"),"model");
            assertThat(system).contains("INVALID_OBSERVATION_CITATION", "E999", "Repair attempt 1/2");
            return new GroqChatResult(report("E1"),"model");
        },AnalysisCheckpoints.NONE,audit);
        assertThat(requests.request("Read actual sources",original,1200,Set.of("E1"),"DEEP_OBSERVATION",Map.of("part",1)).path("evidenceIds").get(0).asString()).isEqualTo("E1");
        assertThat(audit).hasSize(2);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(report("E999"));
        assertThat(audit.getFirst().failureReason()).isEqualTo("INVALID_OBSERVATION_CITATION");
        assertThat(audit.getLast().failureReason()).isNull();
        audit.forEach(a->assertThat(a.validationDetails().get("submittedPrompt")).isEqualTo(original));
    }

    @Test void validated_checkpoint_resumes_same_source_but_is_not_a_new_model_response() {
        var responses=new HashMap<String,GroqChatResult>();var calls=new AtomicInteger();var audit=new ArrayList<MarketAiQuestGeneration.Attempt>();
        AnalysisCheckpoints store=new AnalysisCheckpoints(){
            public Optional<GroqChatResult> find(String system,String prompt,int output){return Optional.ofNullable(responses.get(system+prompt+output));}
            public void save(String system,String prompt,int output,GroqChatResult response){responses.put(system+prompt+output,response);}
        };
        var requests=new AdaptiveObservationRequests(mapper,(system,prompt,output)->{calls.incrementAndGet();return new GroqChatResult(report("E1"),"model");},store,audit);
        requests.request("Read actual sources","{}",1200,Set.of("E1"),"DEEP_OBSERVATION",Map.of());
        requests.request("Read actual sources","{}",1200,Set.of("E1"),"DEEP_OBSERVATION",Map.of());
        assertThat(calls.get()).isEqualTo(1);
        assertThat(audit.getLast().validationDetails().get("source")).isEqualTo("CHECKPOINT");
        // A cached citation cannot bypass validation when allowed sources differ.
        assertThatThrownBy(()->requests.request("Read actual sources","{}",1200,Set.of("E2"),"DEEP_OBSERVATION",Map.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void truncated_json_is_never_accepted_and_repair_calls_have_one_shared_bound() {
        var calls=new AtomicInteger();var audit=new ArrayList<MarketAiQuestGeneration.Attempt>();
        var requests=new AdaptiveObservationRequests(mapper,(system,prompt,output)->{
            calls.incrementAndGet();return new GroqChatResult(report("E1"),"model","length",10,1200,1L);
        },AnalysisCheckpoints.NONE,audit);
        assertThatThrownBy(()->requests.request("system","{}",1200,Set.of("E1"),"DEEP_OBSERVATION",Map.of())).hasMessage("OBSERVATION_OUTPUT_TRUNCATED");
        assertThat(calls.get()).isEqualTo(1+AdaptiveObservationRequests.REPAIR_CALLS);
        assertThat(audit).hasSize(calls.get());
        assertThat(audit).allMatch(a->a.rawOutput().equals(report("E1"))&&a.failureReason().equals("OBSERVATION_OUTPUT_TRUNCATED"));
    }
    @Test void actual_rejected_mcp_citations_are_diagnosed_against_exact_decoded_source() throws Exception {
        var path=java.nio.file.Path.of("../output/persona45-mcp-20261013/quick-decider-1/recommendation-1/preserved-observation-failure-366b4e77-21db-4590-937f-9103cb2fb22c-2.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(path));
        var attempt=mapper.readTree(java.nio.file.Files.readString(path));
        var source=new oneuldo.behaviorlog.analysis.service.FinalSourceEncoding(mapper).decode(mapper.readTree(attempt.path("validationDetails").path("submittedPrompt").asString()));
        if(source.has("eventColumnEncoding"))source.set("events",new oneuldo.behaviorlog.analysis.service.LosslessEventColumns(mapper).decodeValues(source.path("events")));
        var allowed=AdaptiveQuestEvidence.ids(source,false);var report=mapper.readTree(attempt.path("rawOutput").asString());
        var missing=new ArrayList<String>();for(var id:report.path("evidenceIds"))if(!allowed.contains(id.asString()))missing.add(id.asString());
        java.nio.file.Files.writeString(java.nio.file.Path.of("../output/persona45-mcp-20261013/actual-observation-citation-diagnostic.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("missingIds",missing,"allowedIdCount",allowed.size(),"sourceScope",source.path("movementObservationScope"))));
        assertThat(missing).isNotEmpty();var audit=new ArrayList<MarketAiQuestGeneration.Attempt>();var calls=new AtomicInteger();
        String original=attempt.path("validationDetails").path("submittedPrompt").asString();
        var request=new AdaptiveObservationRequests(mapper,(system,prompt,output)->{
            assertThat(prompt).isEqualTo(original);
            if(calls.getAndIncrement()==0)return new GroqChatResult(attempt.path("rawOutput").asString(),"actual-preserved-model");
            for(String id:missing)assertThat(system).contains(id);
            assertThat(system).contains("Coverage/reference lists");
            return new GroqChatResult(report("E1"),"fixture-technical-repair-only");
        },AnalysisCheckpoints.NONE,audit);
        request.request(AdaptiveMarketQuestService.OBSERVATION_SYSTEM,original,1200,allowed,"DEEP_OBSERVATION",Map.of());
        assertThat(audit.getFirst().rawOutput()).isEqualTo(attempt.path("rawOutput").asString());
        int required=oneuldo.behaviorlog.analysis.service.QwenTokenCounter.inputTokens((String)audit.getLast().validationDetails().get("systemPrompt"),original)+1200+32;
        assertThat(required).isLessThanOrEqualTo(24000);
        java.nio.file.Files.writeString(java.nio.file.Path.of("../output/persona45-mcp-20261013/actual-observation-citation-repair-budget.json"),mapper.writeValueAsString(Map.of("requiredTokens",required,"limit",24000,"missingIds",missing,"fixtureOnlyNotANewPlay",true)));
    }

}
