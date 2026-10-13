package oneuldo.behaviorlog.analysis;

import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewPatchAuditTransitionTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private static final String PATH="/findings/0/interpretation/0/text";
    private static final String BAD="목표 위치를 인지했습니다.";
    private static final String GOOD="목표 위치를 인지했는지는 확인할 수 없습니다.";

    @Test void a_valid_station_patch_can_continue_to_a_model_cognition_patch_without_regenerating_the_review() {
        var original=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)original.at("/stationClaims/0")).put("kind","shelf");
        ((ObjectNode)original.at("/analysis/findings/0/interpretation/0")).put("text",BAD);
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(original.toString(),"mock"));
        when(client.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult("{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"UNKNOWN\"}}]}","mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(800),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review(false),"mock"),new GroqChatClient.GroqChatResult(review(true),"mock"));
        String patch=fixture.mapper.writeValueAsString(Map.of("patches",List.of(Map.of("path","/analysis"+PATH,"value",GOOD))));
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(512),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch,"mock"));
        var input=fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(fixture.mapper,input);var prompts=new AiBehaviorAnalysisPromptFactory(fixture.mapper);
        String source=AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,prompts,input,List.of(),refs,false),null,refs);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline=new TimelineAnalysisPipeline(prompts,validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(true);
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        AiBehaviorAnalysis result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source,2400,24000,audit,parse,false,3);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings().getFirst().interpretation()).isEqualTo(GOOD);
        assertThat(audit).anySatisfy(a->assertThat(a.rawOutput()).isEqualTo(patch));
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble());
        verify(client,times(2)).complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(800),eq(0.0));
        assertThat(original.at("/analysis/findings/0/interpretation/0/text").asString()).isEqualTo(BAD);
    }

    private String review(boolean valid) {
        var root=fixture.mapper.createObjectNode().put("verdict",valid?"VALID":"REPAIR");
        root.set("checkedDimensions",fixture.mapper.valueToTree(List.of("SUPPORT_CAPABILITIES","STATION_IDENTITY","UNCERTAIN_CAUSES")));
        var issues=root.putArray("issues");
        if(!valid)issues.addObject().put("code","UNCONFIRMED_COGNITION").put("path",PATH).put("quote",BAD).put("explanation","이동 기록은 인지를 확인하지 않습니다.");
        root.putArray("cognitionChecks").addObject().put("path",PATH).put("status",valid?"UNCERTAIN_OR_PROPOSED":"UNSUPPORTED_ASSERTION").putNull("sourcePath");
        return root.toString();
    }

    @Test void alternative_cleanup_can_continue_to_cognition_repair_with_original_grade_and_unknowns_preserved() {
        var original=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)original.at("/analysis/findings/0/interpretation/0")).put("text",BAD);
        ((ObjectNode)original.at("/analysis/findings/0")).putArray("alternativeExplanations")
                .addObject().put("text","인터페이스 사용법을 모를 수 있습니다.").putArray("evidenceEventIds");
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(original.toString(),"mock"));
        String alternative="{\"patches\":[{\"path\":\"/analysis/findings/0/alternativeExplanations\",\"value\":[]}]}";
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM),anyString(),anyInt(),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(alternative,"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(800),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review(false),"mock"),new GroqChatClient.GroqChatResult(review(true),"mock"));
        String semantic=fixture.mapper.writeValueAsString(Map.of("patches",List.of(Map.of("path","/analysis"+PATH,"value",GOOD))));
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(512),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(semantic,"mock"));
        var input=fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(fixture.mapper,input);var prompts=new AiBehaviorAnalysisPromptFactory(fixture.mapper);
        String source=AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,prompts,input,List.of(),refs,false),null,refs);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline=new TimelineAnalysisPipeline(prompts,validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(true);
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        AiBehaviorAnalysis result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source,2400,24000,audit,parse,false,3);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings().getFirst().interpretation()).isEqualTo(GOOD);
        assertThat(result.uncertainties()).isEqualTo(fixture.mapper.convertValue(original.at("/analysis/uncertainties"),List.class));
        assertThat(audit).anySatisfy(a->assertThat(a.rawOutput()).isEqualTo(alternative));
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble());
        assertThat(original.at("/analysis/findings/0/alternativeExplanations")).hasSize(1);
    }
}
