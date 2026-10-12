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
            assertThat(system).contains("INVALID_OBSERVATION_CITATION");
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
}
