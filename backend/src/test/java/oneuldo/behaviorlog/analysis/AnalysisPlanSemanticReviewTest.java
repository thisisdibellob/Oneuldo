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

class AnalysisPlanSemanticReviewTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private final String valid = "{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}";
    @Test void source_quoted_unavailable_ui_is_rejected_while_bad_pointers_and_forged_quotes_are_not_accepted() {
        var candidate = new AnalysisReviewConsistencyTest().envelope("corrected-selection");
        ((ObjectNode)candidate.path("analysis").path("practicePlan").path("rationale")).put("proposedPractice", "매대 위치를 시각적으로 강조합니다.");
        String rejected = rejection();
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(fixture.mapper, rejected, candidate.toString()))
                .isInstanceOf(AnalysisPlanSemanticReview.Rejected.class).hasMessage("REVIEW_PLAN_SEMANTIC_MISMATCH");
        for (String bad : List.of(rejected.replace("/practicePlan/rationale/proposedPractice", "/invented"), rejected.replace("시각적으로 강조합니다.", "음성을 추가합니다.")))
            assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(fixture.mapper, bad, candidate.toString())).hasMessage("REVIEW_PLAN_SEMANTIC_FORMAT");
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(fixture.mapper, valid, candidate.toString())).doesNotThrowAnyException();
        String partialRepair = rejected.replace("\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"", "\"SUPPORT_CAPABILITIES\"");
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(fixture.mapper, partialRepair, candidate.toString())).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        String partialApproval = valid.replace("\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"", "\"SUPPORT_CAPABILITIES\"");
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(fixture.mapper, partialApproval, candidate.toString())).hasMessage("REVIEW_PLAN_SEMANTIC_FORMAT");
        // A valid JSON envelope alone does not mean its capability text is correct; that decision above belongs to the reviewer.
    }
    @Test void production_retry_preserves_bad_candidate_and_independent_review_then_accepts_only_reviewed_repair() {
        var input = fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("corrected-selection"), BehaviorAnalysisInputResponse.class);
        var refs = new AnalysisReferences(fixture.mapper, input);
        var source = AnalysisSynthesisPrompt.build(fixture.mapper, new AiBehaviorAnalysisPromptFactory(fixture.mapper), input, List.of(), refs, false);
        var prompt = AnalysisReviewPrompt.build(fixture.mapper, source, null, refs);
        var good = new AnalysisReviewConsistencyTest().envelope("corrected-selection"); var bad = good.deepCopy();
        ((ObjectNode)bad.path("analysis").path("practicePlan").path("rationale")).put("proposedPractice", "매대 위치를 시각적으로 강조합니다.");
        var client = mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(bad.toString(), "mock"));
        var patch=fixture.mapper.createObjectNode();patch.putArray("patches").addObject()
                .put("path","/analysis/practicePlan/rationale/proposedPractice")
                .put("value","매대 위치를 기존 문자 안내로 확인하는 연습을 제안합니다.");
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(ReviewSemanticTextPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch.toString(),"mock"));
        var proposed=ReviewSemanticTextPatch.apply(fixture.mapper,bad.toString(),rejection(),patch.toString());
        var descriptor=SourceBoundReviewChecks.describe(fixture.mapper,proposed,prompt);
        var approved=(ObjectNode)fixture.mapper.readTree(valid);var bound=approved.putObject("sourceBoundChecks");bound.putArray("stations");var units=bound.putArray("capabilities");
        for(var unit:descriptor.path("capabilityUnits")) {
            var row=units.addObject().put("path",unit.path("path").asString()).put("quote",unit.path("quote").asString());var proofs=row.putArray("proofs");
            for(var field:unit.path("fieldPaths"))proofs.addObject().put("fieldPath",field.asString()).set("sourceValue",descriptor.path("implementedCapabilities").path("fields").path(field.asString()));
        }
        when(client.complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(rejection(), "mock"), new GroqChatClient.GroqChatResult(approved.toString(), "mock"));
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()); var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper), validator, client, fixture.mapper)
                .withQualityReview(true).withPlanSemanticReview(true);
        Function<String, AiBehaviorAnalysis> parse = raw -> validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, raw, refs)), input);
        AiBehaviorAnalysis result = ReflectionTestUtils.invokeMethod(pipeline, "call", AnalysisReviewPrompt.system(), prompt, 2400, 18000, audit, parse, false, 3);
        assertThat(result.practicePlan().rationale()).doesNotContain("시각적으로 강조");
        assertThat(audit).hasSize(4);
        assertThat(audit.get(0).rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.get(0).validationFailure().code()).isEqualTo("REVIEW_PLAN_SEMANTIC_MISMATCH");
        assertThat(audit.get(1).source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(audit.get(2).inputPrompt()).startsWith(prompt).contains("UNSUPPORTED_CAPABILITY",bad.toString());
        assertThat(audit.get(2).source()).isEqualTo("REVIEW_SEMANTIC_TEXT_PATCH");
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble());
        var restored=fixture.mapper.readTree(ReviewSemanticTextPatch.apply(fixture.mapper,bad.toString(),rejection(),patch.toString()));
        ((ObjectNode)restored.at("/analysis/practicePlan/rationale")).set("proposedPractice",bad.at("/analysis/practicePlan/rationale/proposedPractice"));
        assertThat(restored).isEqualTo(bad);
        assertThat(audit.get(3).errorCode()).isNull();
    }
    private String rejection() {
        return "{\"verdict\":\"REPAIR\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[{\"code\":\"UNSUPPORTED_CAPABILITY\",\"path\":\"/practicePlan/rationale/proposedPractice\",\"quote\":\"시각적으로 강조합니다.\",\"explanation\":\"시각 강조는 미구현이며 문자 안내 등 현재 지원으로 수정해야 합니다.\"}]}";
    }
}
