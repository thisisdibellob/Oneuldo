package oneuldo.behaviorlog.analysis;

import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewAlternativeExplanationPatchTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private static final String PATH = "/analysis/findings/0/alternativeExplanations";
    private final ReviewEvidenceException.Details failure = failure(0);

    @Test void model_array_preserves_supported_rows_and_all_other_values_with_append_only_uncertainties() {
        var original = mixed();
        var reported = mixedFailure();
        var values = fixture.mapper.createArrayNode();
        values.add(original.at(PATH).get(0).deepCopy());
        values.add(original.at(PATH).get(2).deepCopy());
        var unknowns = (ArrayNode)original.at("/analysis/uncertainties").deepCopy();
        unknowns.add("미확인 가설의 원인은 원본으로 확인되지 않았습니다.");
        String response = patch(PATH, values, unknowns);
        var after = fixture.mapper.readTree(ReviewAlternativeExplanationPatch.apply(fixture.mapper, original.toString(), reported, response));
        assertThat(after.at(PATH)).isEqualTo(values);
        assertThat(after.at("/analysis/uncertainties")).isEqualTo(unknowns);
        assertThat(after.at("/analysis/practicePlan/rationale")).isEqualTo(original.at("/analysis/practicePlan/rationale"));
        ((ObjectNode)after.at("/analysis/findings/0")).set("alternativeExplanations", original.at(PATH));
        ((ObjectNode)after.path("analysis")).set("uncertainties", original.at("/analysis/uncertainties"));
        assertThat(after).isEqualTo(original);
        assertThat(ReviewAlternativeExplanationPatch.prompt(fixture.mapper, "모든 원본 사건은 여기에 있습니다.", original.toString(), reported))
                .startsWith("모든 원본 사건은 여기에 있습니다.\nCandidate (all values retained): " + original)
                .contains(PATH, "/analysis/uncertainties");
    }

    @Test void rewriting_supported_rows_evidence_grades_other_findings_or_uncertainty_prefix_is_rejected() {
        var original = mixed();
        var reported = mixedFailure();
        var retained = fixture.mapper.createArrayNode();
        retained.add(original.at(PATH).get(0).deepCopy());
        retained.add(original.at(PATH).get(2).deepCopy());
        var changed = retained.deepCopy();
        ((ObjectNode)changed.get(0)).put("text", "새로운 원인을 확정했습니다.");
        var changedEvidence = retained.deepCopy();
        ((ObjectNode)changedEvidence.get(0)).putArray("evidenceEventIds").add("E999");
        var reversed = fixture.mapper.createArrayNode().add(retained.get(1)).add(retained.get(0));
        var unsupported = retained.deepCopy();
        unsupported.add(original.at(PATH).get(1).deepCopy());
        var extraClaim = retained.deepCopy();
        extraClaim.addObject().put("text", "모델이 새로 붙인 설명입니다.").putArray("evidenceEventIds").add("E1");
        var changedPrefix = fixture.mapper.createArrayNode().add("기존 불확실성 대신 다른 원인입니다.");
        var reversedPrefix = fixture.mapper.createArrayNode().add(original.at("/analysis/uncertainties/1")).add(original.at("/analysis/uncertainties/0"));
        String valid = patch(PATH, retained, null);
        for (String rejected : List.of(
                patch(PATH, changed, null), patch(PATH, changedEvidence, null), patch(PATH, reversed, null),
                patch(PATH, fixture.mapper.createArrayNode(), null), patch(PATH, unsupported, null), patch(PATH, extraClaim, null),
                patch(PATH, retained, changedPrefix), patch(PATH, retained, reversedPrefix), patch(PATH, retained, fixture.mapper.createArrayNode()),
                patch("/analysis/findings/1/alternativeExplanations", retained, null),
                patch("/analysis/sessionAssessments/0/judgment", fixture.mapper.createArrayNode(), null),
                patch("/analysis/practicePlan/rationale/unknownCauseIndexes", fixture.mapper.createArrayNode(), null),
                valid + " {}", valid.substring(0, valid.length()-1) + ",\"analysis\":{}}"))
            assertThatThrownBy(() -> ReviewAlternativeExplanationPatch.apply(fixture.mapper, original.toString(), reported, rejected))
                    .hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
        var duplicate = (ObjectNode)fixture.mapper.readTree(valid);
        ((ArrayNode)duplicate.path("patches")).add(duplicate.path("patches").get(0).deepCopy());
        assertThatThrownBy(() -> ReviewAlternativeExplanationPatch.apply(fixture.mapper, original.toString(), reported, duplicate.toString()))
                .hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
    }

    @Test void eligibility_is_only_an_existing_empty_evidence_alternative_at_the_reported_finding() {
        var candidate = bad(false).toString();
        assertThat(ReviewAlternativeExplanationPatch.canRepair(fixture.mapper, candidate, failure)).isTrue();
        for (var invalid : List.of(
                new ReviewEvidenceException.Details("INVALID_REVIEW_CLAIM_ARRAY", "/findings/0/observation/0/evidenceEventIds", List.of()),
                new ReviewEvidenceException.Details("INVALID_REVIEW_CLAIM_ARRAY", "/findings/0/alternativeExplanations", List.of()),
                new ReviewEvidenceException.Details("UNKNOWN_REVIEW_EVIDENCE", "/findings/0/alternativeExplanations/0/evidenceEventIds", List.of("E999")),
                new ReviewEvidenceException.Details("INVALID_REVIEW_CLAIM_ARRAY", "/findings/0/alternativeExplanations/0/evidenceEventIds", List.of("E1")),
                failure(99)))
            assertThat(ReviewAlternativeExplanationPatch.canRepair(fixture.mapper, candidate, invalid)).isFalse();
        var supplied = bad(false);
        ((ObjectNode)supplied.at(PATH).get(0)).putArray("evidenceEventIds").add("E1");
        assertThat(ReviewAlternativeExplanationPatch.canRepair(fixture.mapper, supplied.toString(), failure)).isFalse();
        assertThatThrownBy(() -> ReviewAlternativeExplanationPatch.apply(fixture.mapper, candidate, failure, "{}"))
                .hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
    }

    @Test void two_findings_are_model_patched_separately_then_source_and_semantic_gates_pass() {
        var candidate = bad(true); var client = client(candidate);
        String first = patch(PATH, fixture.mapper.createArrayNode(), null);
        String second = patch("/analysis/findings/1/alternativeExplanations", fixture.mapper.createArrayNode(), null);
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(first, "mock"), new GroqChatClient.GroqChatResult(second, "mock"));
        validSemantic(client);
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result = call(client, audit, true);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings()).hasSize(2).allSatisfy(finding -> assertThat(finding.alternativeExplanations()).isEmpty());
        assertThat(audit).hasSize(4);
        assertThat(audit.get(1).rawOutput()).isEqualTo(first);
        assertThat(audit.get(1).errorCode()).isEqualTo("REVIEW_CANDIDATE_REJECTED");
        assertThat(audit.get(1).validationFailure().path()).isEqualTo("/findings/1/alternativeExplanations/0/evidenceEventIds");
        assertThat(audit.get(2).rawOutput()).isEqualTo(second);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(audit.get(1).inputPrompt()).startsWith(source()).contains(candidate.toString());
        assertThat(audit.get(2).inputPrompt()).startsWith(source()).contains("\"judgment\":\"FAILURE\"");
        verify(client, times(2)).complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0));
        verify(client, times(1)).complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), eq(0.0));
    }

    @Test void malformed_model_response_is_audited_and_three_invalid_responses_stop_without_a_fallback() {
        var candidate = bad(false); var client = client(candidate);
        String wrongPath = patch("/analysis/sessionAssessments/0/judgment", fixture.mapper.createArrayNode(), null);
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(wrongPath, "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client, audit, false)).hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
        assertThat(audit).hasSize(4);
        assertThat(audit.subList(1, 4)).allSatisfy(attempt -> {
            assertThat(attempt.rawOutput()).isEqualTo(wrongPath);
            assertThat(attempt.inputPrompt()).startsWith(source()).contains(candidate.toString());
        });
        verify(client, times(3)).complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0));
        verify(client, never()).complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), anyDouble());
    }

    @Test void metadata_and_literal_formatting_hand_off_to_two_targeted_alternative_patches_without_extra_format_inference() {
        var candidate = bad(true); var client = mock(GroqChatClient.class);
        var firstClaim = (ObjectNode)candidate.at("/analysis/summary/0");
        String literal = firstClaim.path("text").asString();
        firstClaim.put("text", literal + "(E1-E3)");
        ((ObjectNode)candidate.at("/analysis/practicePlan/rationale")).put("baselineDifficulty", "exact");
        ((ObjectNode)candidate.at("/stationClaims/0")).put("kind", "shelf");
        var station = fixture.mapper.createObjectNode().put("eventId", "E4").put("stationId", "fresh").put("kind", "UNKNOWN");
        when(client.complete(eq(ReviewStationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch("/stationClaims/0", station, null), "mock"));
        when(client.complete(eq(ReviewMetadataPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch(ReviewMetadataPatch.PATH, fixture.mapper.nullNode(), null), "mock"));
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch(PATH, fixture.mapper.createArrayNode(), null), "mock"),
                        new GroqChatClient.GroqChatResult(patch("/analysis/findings/1/alternativeExplanations", fixture.mapper.createArrayNode(), null), "mock"));
        validSemantic(client);
        var input = input(); var refs = new AnalysisReferences(fixture.mapper, input);
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper), validator, client, fixture.mapper)
                .withQualityReview(true).withPlanSemanticReview(true);
        Function<String, AiBehaviorAnalysis> parse = raw -> validator.validate(refs.read(
                AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, raw, refs)), input);
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        AiBehaviorAnalysis result = ReflectionTestUtils.invokeMethod(pipeline, "repairReviewMetadata", source(), candidate.toString(),
                new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/0", List.of("E4")), 24000, audit, parse);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings()).hasSize(2).allSatisfy(finding -> assertThat(finding.alternativeExplanations()).isEmpty());
        assertThat(audit).hasSize(5);
        assertThat(audit.subList(0, 2)).extracting(AiBehaviorAnalysisRun.Attempt::source)
                .containsExactly("REVIEW_STATION_PATCH", "REVIEW_METADATA_PATCH");
        assertThat(audit.get(1).validationFailure().code()).isEqualTo("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
        assertThat(audit.get(2).validationFailure().code()).isEqualTo("INVALID_REVIEW_CLAIM_ARRAY");
        assertThat(audit.get(2).source()).isEqualTo("REVIEW_ALTERNATIVE_PATCH");
        assertThat(audit.get(3).source()).isEqualTo("REVIEW_ALTERNATIVE_PATCH");
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        verify(client, times(2)).complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0));
        verify(client, never()).complete(eq(ReviewClaimTextPatch.SYSTEM), anyString(), anyInt(), anyDouble());
    }

    @Test void preserved_unknown_source_evidence_still_fails_the_existing_source_gate() {
        var candidate = bad(false);
        var rows = (ArrayNode)candidate.at(PATH);
        rows.addObject().put("text", "기존의 미확인 근거입니다.").putArray("evidenceEventIds").add("E999");
        var client = client(candidate);
        var retained = fixture.mapper.createArrayNode().add(rows.get(1).deepCopy());
        String response = patch(PATH, retained, null);
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(response, "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client, audit, true)).hasMessage("UNKNOWN_REVIEW_EVIDENCE");
        assertThat(audit.getLast().rawOutput()).isEqualTo(response);
        assertThat(audit.getLast().validationFailure().code()).isEqualTo("UNKNOWN_REVIEW_EVIDENCE");
        verify(client, never()).complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), anyDouble());
    }

    @Test void an_appended_unconfirmed_cause_still_can_be_rejected_by_independent_semantics() {
        var candidate = bad(false); var client = client(candidate);
        var unknowns = (ArrayNode)candidate.at("/analysis/uncertainties").deepCopy();
        unknowns.add("기기 고장으로 구매가 중단되었습니다.");
        String response = patch(PATH, fixture.mapper.createArrayNode(), unknowns);
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(response, "mock"));
        String rejection = "{\"verdict\":\"REPAIR\",\"checkedDimensions\":[\"UNCERTAIN_CAUSES\"],\"issues\":[{\"code\":\"UNCONFIRMED_CAUSE\",\"path\":\"/uncertainties/1\",\"quote\":\"기기 고장으로 구매가 중단되었습니다.\",\"explanation\":\"원본에 기기 고장 근거가 없습니다.\"}]}";
        when(client.complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(rejection, "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client, audit, true)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        assertThat(audit.get(1).rawOutput()).isEqualTo(response);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(audit.getLast().validationFailure().code()).isEqualTo("REVIEW_PLAN_SEMANTIC_MISMATCH");
    }

    @Test void literal_response_budget_grows_with_preserved_rows_and_uncertainties_and_reserves_safety() {
        var original = mixed();
        int shortOutput = ReviewAlternativeExplanationPatch.outputTokens(fixture.mapper, original.toString(), mixedFailure());
        ((ArrayNode)original.at("/analysis/uncertainties")).add("원인과 의도는 아직 확인되지 않았으며 기록 범위를 유지합니다. ".repeat(40));
        int longOutput = ReviewAlternativeExplanationPatch.outputTokens(fixture.mapper, original.toString(), mixedFailure());
        assertThat(longOutput).isGreaterThan(shortOutput);
        assertThat(ReviewAlternativeExplanationPatch.SAFETY_TOKENS).isEqualTo(512);
    }

    private ObjectNode bad(boolean twoFindings) {
        var root = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        var first = (ObjectNode)root.at("/analysis/findings/0");
        first.putArray("alternativeExplanations").addObject().put("text", "사용법을 모를 수 있습니다.").putArray("evidenceEventIds");
        if (twoFindings) {
            var second = first.deepCopy(); second.put("id", "F2");
            ((ArrayNode)root.at("/analysis/findings")).add(second);
        }
        return root;
    }
    private ObjectNode mixed() {
        var root = bad(true); var rows = ((ObjectNode)root.at("/analysis/findings/0")).putArray("alternativeExplanations");
        rows.addObject().put("text", "기존 근거 있는 대안 첫째입니다.").putArray("evidenceEventIds").add("E4");
        rows.addObject().put("text", "미확인 가설입니다.").putArray("evidenceEventIds");
        rows.addObject().put("text", "기존 근거 있는 대안 둘째입니다.").putArray("evidenceEventIds").add("E11");
        ((ArrayNode)root.at("/analysis/uncertainties")).add("이미 확인된 한계 둘째입니다.");
        return root;
    }
    private ReviewEvidenceException.Details failure(int finding) {
        return new ReviewEvidenceException.Details("INVALID_REVIEW_CLAIM_ARRAY", "/findings/" + finding + "/alternativeExplanations/0/evidenceEventIds", List.of());
    }
    private ReviewEvidenceException.Details mixedFailure() {
        return new ReviewEvidenceException.Details("INVALID_REVIEW_CLAIM_ARRAY", "/findings/0/alternativeExplanations/1/evidenceEventIds", List.of());
    }
    private String patch(String path, JsonNode values, JsonNode unknowns) {
        var root = fixture.mapper.createObjectNode(); var patches = root.putArray("patches");
        patches.addObject().put("path", path).set("value", values);
        if (unknowns != null) patches.addObject().put("path", "/analysis/uncertainties").set("value", unknowns);
        return root.toString();
    }
    private BehaviorAnalysisInputResponse input() {
        return fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"), BehaviorAnalysisInputResponse.class);
    }
    private String source() {
        var input = input(); var refs = new AnalysisReferences(fixture.mapper, input);
        return AnalysisReviewPrompt.build(fixture.mapper, AnalysisSynthesisPrompt.build(fixture.mapper,
                new AiBehaviorAnalysisPromptFactory(fixture.mapper), input, List.of(), refs, false), null, refs);
    }
    private GroqChatClient client(ObjectNode candidate) {
        var client = mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(candidate.toString(), "mock"));
        return client;
    }
    private void validSemantic(GroqChatClient client) {
        when(client.complete(eq(AnalysisPlanSemanticReview.system()), anyString(), anyInt(), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult("{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}", "mock"));
    }
    private AiBehaviorAnalysis call(GroqChatClient client, List<AiBehaviorAnalysisRun.Attempt> audit, boolean semantic) {
        var input = input(); var refs = new AnalysisReferences(fixture.mapper, input);
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper), validator, client, fixture.mapper)
                .withQualityReview(true).withPlanSemanticReview(semantic);
        Function<String, AiBehaviorAnalysis> parse = raw -> validator.validate(refs.read(
                AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, raw, refs)), input);
        return ReflectionTestUtils.invokeMethod(pipeline, "call", AnalysisReviewPrompt.system(), source(), 2400, 24000, audit, parse, false, 3);
    }
}
