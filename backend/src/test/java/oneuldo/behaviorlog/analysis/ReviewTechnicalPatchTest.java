package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
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

class ReviewTechnicalPatchTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private final String baselinePatch = "{\"patches\":[{\"path\":\"/analysis/practicePlan/rationale/baselineDifficulty\",\"value\":null}]}";
    private final ReviewEvidenceException.Details stationFailure =
            new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/0", List.of("E4"));

    @Test void station_patch_preserves_every_other_candidate_field_and_cannot_modify_a_judgment() {
        var candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        var original = candidate.deepCopy();
        String response = stationPatch("UNKNOWN");
        var changed = fixture.mapper.readTree(ReviewStationPatch.apply(fixture.mapper, candidate.toString(), response));
        assertThat(changed.path("analysis")).isEqualTo(original.path("analysis"));
        assertThat(changed.path("taskChecks")).isEqualTo(original.path("taskChecks"));
        ((ObjectNode)changed).set("stationClaims", original.path("stationClaims"));
        assertThat(changed).isEqualTo(original);
        for (String bad : List.of(response.replace("/stationClaims", "/analysis/sessionAssessments"),
                response.replace("\"kind\":\"UNKNOWN\"", "\"kind\":\"UNKNOWN\",\"judgment\":\"SUCCESS\""),
                response.substring(0, response.length()-1)+",\"analysis\":{}}", response+" {}"))
            assertThatThrownBy(() -> ReviewStationPatch.apply(fixture.mapper, candidate.toString(), bad))
                    .isInstanceOf(RuntimeException.class);
    }

    @Test void station_prompt_quotes_the_exact_decoded_source_row_and_retains_all_sources_and_candidate() {
        String source = source();
        String candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification").toString();
        String prompt = ReviewStationPatch.prompt(fixture.mapper, source, candidate, stationFailure);
        assertThat(prompt).startsWith(source).contains("Candidate (all values retained): "+candidate,
                "\"eventId\":\"E4\"", "\"stationId\":\"fresh\"", "\"kind\":\"UNKNOWN\"");
        assertThat(ReviewStationPatch.SYSTEM).contains("UNKNOWN stays UNKNOWN", "Preserve every other candidate value");
        var absent = new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/0", List.of("E999"));
        assertThat(ReviewStationPatch.prompt(fixture.mapper, source, candidate, absent))
                .contains("Literal source rows for reported IDs (empty means no station source row): []");
    }

    @Test void non_integer_original_difficulty_is_explained_as_a_type_error_and_never_coerced() {
        String source = "{\"taskContext\":[{\"sourceEventId\":\"E1\",\"mission\":{\"difficulty\":\"exact\"}}]}";
        var candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)candidate.path("analysis").path("practicePlan").path("rationale")).put("baselineDifficulty", 2);
        var failure = new ReviewEvidenceException.Details("REVIEW_UNRECORDED_DIFFICULTY_BASELINE", "/practicePlan/rationale/baselineDifficulty", List.of());
        String prompt = ReviewMetadataPatch.prompt(fixture.mapper, source, candidate.toString(), failure);
        assertThat(prompt).startsWith(source).contains(candidate.toString(), "\"sourceType\":\"STRING\"", "\"recordedValue\":\"exact\"");
        assertThat(ReviewMetadataPatch.SYSTEM).contains("Strings such as exact", "must not be copied or converted");
        assertThatThrownBy(() -> ReviewMetadataPatch.apply(fixture.mapper, candidate.toString(), baselinePatch.replace("null", "\"exact\"")))
                .hasMessage("INVALID_REVIEW_METADATA_PATCH");
        var repaired = fixture.mapper.readTree(ReviewMetadataPatch.apply(fixture.mapper, candidate.toString(), baselinePatch));
        ((ObjectNode)repaired.path("analysis").path("practicePlan").path("rationale")).put("baselineDifficulty", 2);
        assertThat(repaired).isEqualTo(candidate);
    }

    @Test void pipeline_uses_successive_model_patches_without_rewriting_the_failed_task_or_original_source() {
        var bad = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)bad.path("stationClaims").get(0)).put("kind", "shelf");
        ((ObjectNode)bad.path("analysis").path("practicePlan").path("rationale")).put("baselineDifficulty", 2);
        var client = mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(bad.toString(), "mock"));
        when(client.complete(eq(ReviewStationPatch.SYSTEM), anyString(), eq(ReviewStationPatch.OUTPUT_TOKENS), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(stationPatch("UNKNOWN"), "mock"));
        when(client.complete(eq(ReviewMetadataPatch.SYSTEM), anyString(), eq(ReviewMetadataPatch.OUTPUT_TOKENS), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(baselinePatch, "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        AiBehaviorAnalysis result = call(client, bad, audit);
        assertThat(result.sessionAssessments().getFirst().judgment().toString()).isEqualTo("FAILURE");
        assertThat(audit).hasSize(3);
        assertThat(audit.get(0).rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.get(1).source()).isEqualTo("REVIEW_STATION_PATCH");
        assertThat(audit.get(1).validationFailure().code()).isEqualTo("REVIEW_UNRECORDED_DIFFICULTY_BASELINE");
        assertThat(audit.get(2).source()).isEqualTo("REVIEW_METADATA_PATCH");
        assertThat(audit.get(2).errorCode()).isNull();
        for (var attempt : audit.subList(1,3)) assertThat(attempt.inputPrompt()).startsWith(source());
        assertThat(audit.get(1).inputPrompt()).contains(bad.toString());
        assertThat(audit.get(2).inputPrompt()).contains("\"judgment\":\"FAILURE\"");
    }

    @Test void a_model_patch_cannot_bypass_the_existing_literal_source_validator() {
        var bad = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)bad.path("stationClaims").get(0)).put("kind", "shelf");
        var client = mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(bad.toString(), "mock"));
        when(client.complete(eq(ReviewStationPatch.SYSTEM), anyString(), eq(ReviewStationPatch.OUTPUT_TOKENS), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(stationPatch("shelf"), "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client, bad, audit)).hasMessage("REVIEW_STATION_CLAIM_INVALID");
        assertThat(audit).hasSize(4);
        assertThat(audit).allSatisfy(attempt -> assertThat(attempt.validationFailure().code()).isEqualTo("REVIEW_STATION_CLAIM_INVALID"));
    }

    @Test void actual_minjae_source_and_full_candidate_fit_small_patch_requests_without_dropping_original_values() throws Exception {
        var directory = Path.of("../output/persona45-mcp-20261013/adult-minjae-unit-support-research-v2-1/baseline-pre/review-repair-diagnostics");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(directory.resolve("attempt-17-review.json")));
        var station = fixture.mapper.readTree(Files.readString(directory.resolve("attempt-17-review.json")));
        var baseline = fixture.mapper.readTree(Files.readString(directory.resolve("attempt-18-review.json")));
        String stationSource = station.path("inputPrompt").asString();
        String stationCandidate = station.path("rawOutput").asString();
        var actualFailure = new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/16", List.of("E1586"));
        String stationPrompt = ReviewStationPatch.prompt(fixture.mapper, stationSource, stationCandidate, actualFailure);
        assertThat(stationPrompt).startsWith(stationSource).contains(stationCandidate,
                "{\"eventId\":\"E1586\",\"kind\":\"entrance\",\"stationId\":\"entrance\"}");
        // The pipeline patches against its canonical original review source,
        // not the full-review retry suffix. Keep that submitted retry in audit.
        assertThat(baseline.path("inputPrompt").asString()).startsWith(stationSource);
        String baselineSource = stationSource;
        String baselineCandidate = baseline.path("rawOutput").asString();
        String baselinePrompt = ReviewMetadataPatch.prompt(fixture.mapper, baselineSource, baselineCandidate,
                new ReviewEvidenceException.Details("REVIEW_UNRECORDED_DIFFICULTY_BASELINE", "/practicePlan/rationale/baselineDifficulty", List.of()));
        assertThat(baselinePrompt).startsWith(baselineSource).contains(baselineCandidate, "\"recordedValue\":\"exact\"");
        int stationTokens = QwenTokenCounter.inputTokens(ReviewStationPatch.SYSTEM,stationPrompt)+ReviewStationPatch.OUTPUT_TOKENS+32;
        int baselineTokens = QwenTokenCounter.inputTokens(ReviewMetadataPatch.SYSTEM,baselinePrompt)+ReviewMetadataPatch.OUTPUT_TOKENS+32;
        assertThat(stationTokens).isLessThanOrEqualTo(24000);
        assertThat(baselineTokens).isLessThanOrEqualTo(24000);
        Files.writeString(directory.resolve("patch-budget-verification.json"), fixture.mapper.writeValueAsString(Map.of(
                "stationRequiredTokens",stationTokens,"baselineRequiredTokens",baselineTokens,"limit",24000,
                "fullOriginalSourcesAndCandidatesRetained",true,"actualModelRepairVerified",false)));
    }

    private String stationPatch(String kind) {
        return "{\"patches\":[{\"path\":\"/stationClaims\",\"value\":[{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\""+kind+"\"}]}]}";
    }
    private String source() {
        var input = fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"), BehaviorAnalysisInputResponse.class);
        var refs = new AnalysisReferences(fixture.mapper,input);
        String original = AnalysisSynthesisPrompt.build(fixture.mapper,new AiBehaviorAnalysisPromptFactory(fixture.mapper),input,List.of(),refs,false);
        return AnalysisReviewPrompt.build(fixture.mapper,original,null,refs);
    }
    private AiBehaviorAnalysis call(GroqChatClient client, ObjectNode candidate, List<AiBehaviorAnalysisRun.Attempt> audit) {
        var input = fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"), BehaviorAnalysisInputResponse.class);
        var refs = new AnalysisReferences(fixture.mapper,input);
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),validator,client,fixture.mapper).withQualityReview(true);
        Function<String,AiBehaviorAnalysis> parse = raw -> validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        return ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source(),2400,24000,audit,parse,false,3);
    }
}
