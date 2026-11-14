package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewEnvelopeRecoveryTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    ObjectNode candidate(String plan) { return ReflectionTestUtils.invokeMethod(new SourceBoundReviewChecksTest(),"candidate","상품 선택 여부는 미확인입니다.",plan); }
    ObjectNode source() { return ReflectionTestUtils.invokeMethod(new SourceBoundReviewChecksTest(),"source",null,false); }
    String valid(ObjectNode candidate,ObjectNode source) { return ReflectionTestUtils.invokeMethod(new SourceBoundReviewChecksTest(),"validChecks",candidate.toString(),source.toString(),false); }
    GroqChatClient.GroqChatResult response(String text) { return new GroqChatClient.GroqChatResult(text,"test","stop",1,1,1L); }
    TimelineAnalysisPipeline pipeline(GroqChatClient client) {
        return new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,mapper,32,new AnalysisTokenBudget(),new AnalysisCallPacer());
    }
    @Test void repair_literal_proof_type_locally_without_regenerating_analysis_or_changing_sources() {
        var candidate=candidate("직원 수를 2명으로 배치합니다.");var source=source();String original=candidate.toString();
        String good=valid(candidate,source);var malformed=(ObjectNode)mapper.readTree(good);
        var proof=(ObjectNode)malformed.at("/sourceBoundChecks/capabilities/0/proofs/0");
        proof.set("sourceValue",proof.path("sourceValue").path("scope"));
        var client=mock(GroqChatClient.class);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(response(malformed.toString()),response(good));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        ReflectionTestUtils.invokeMethod(pipeline(client),"reviewPlanSource",source.toString(),original,30000,audit);
        assertThat(audit).hasSize(2);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(malformed.toString());
        assertThat(audit.getLast().rawOutput()).isEqualTo(good);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW_FORMAT_REPAIR");
        assertThat(candidate.toString()).isEqualTo(original);
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
        var prompt=mapper.readTree(AnalysisPlanSemanticReview.prompt(mapper,source.toString(),original));
        assertThat(prompt.at("/outputSchema/sourceBoundChecks/capabilities/0/proofs/0/sourceValue").isObject()).isTrue();
    }
    @Test void persistent_invalid_metadata_is_bounded_and_never_treated_as_approved() {
        var candidate=candidate("직원 수를 2명으로 배치합니다.");var source=source();var client=mock(GroqChatClient.class);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(response("{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}"));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(pipeline(client),"reviewPlanSource",source.toString(),candidate.toString(),30000,audit))
                .hasMessageContaining("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
        assertThat(audit).hasSize(3);assertThat(audit).allSatisfy(a->assertThat(a.errorCode()).isEqualTo("INVALID_PLAN_SOURCE_REVIEW"));
    }
}
