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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewClaimTextPatchTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private final ReviewEvidenceException.Details failure = new ReviewEvidenceException.Details(
            "INLINE_REVIEW_REFERENCE_NOT_ALLOWED", "/summary/0", List.of("E1"));
    private static final Path OWN = Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-1");

    @Test void model_text_patch_cannot_change_prose_citations_judgments_or_any_other_field() {
        var candidate = candidate();
        String patch = patch(Map.of("/analysis/summary/0/text", "제공된 미션과 종료 기록입니다."));
        var result = fixture.mapper.readTree(ReviewClaimTextPatch.apply(fixture.mapper, candidate.toString(), patch));
        assertThat(result.at("/analysis/summary/0/evidenceEventIds")).isEqualTo(candidate.at("/analysis/summary/0/evidenceEventIds"));
        ((ObjectNode)result.at("/analysis/summary/0")).set("text", candidate.at("/analysis/summary/0/text"));
        assertThat(result).isEqualTo(candidate);
        for (String invalid : List.of(
                patch.replace("제공된 미션과 종료 기록입니다.", "목표를 달성했습니다."),
                patch.replace("/analysis/summary/0/text", "/analysis/summary/0/evidenceEventIds"),
                patch.replace("/analysis/summary/0/text", "/analysis/sessionAssessments/0/judgment"),
                patch.substring(0,patch.length()-1) + ",\"analysis\":{}}", patch + " {}",
                "{\"patches\":[]}", patch(Map.of("/analysis/summary/0/text", "제공된 미션(E1)과 종료 기록입니다."))))
            assertThatThrownBy(() -> ReviewClaimTextPatch.apply(fixture.mapper, candidate.toString(), invalid))
                    .hasMessage("INVALID_REVIEW_CLAIM_TEXT_PATCH");
    }

    @Test void only_annotation_references_are_eligible_and_all_text_paths_must_be_patched_once() {
        var candidate = candidate();
        assertThat(ReviewClaimTextPatch.canRepair(fixture.mapper, candidate.toString(), failure)).isTrue();
        ((ObjectNode)candidate.at("/analysis/summary/0")).put("text", "E1부터 종료 기록을 살펴봤습니다.");
        assertThat(ReviewClaimTextPatch.canRepair(fixture.mapper, candidate.toString(), failure)).isFalse();
        candidate = candidate();
        ((ObjectNode)candidate.at("/analysis/findings/0/observation/0")).put("text", "목표를 확인했습니다[E1, E4].");
        String original = candidate.toString();
        String incomplete = patch(Map.of("/analysis/summary/0/text", "제공된 미션과 종료 기록입니다."));
        assertThatThrownBy(() -> ReviewClaimTextPatch.apply(fixture.mapper, original, incomplete))
                .hasMessage("INVALID_REVIEW_CLAIM_TEXT_PATCH");
        String complete = patch(Map.of("/analysis/summary/0/text", "제공된 미션과 종료 기록입니다.",
                "/analysis/findings/0/observation/0/text", "목표를 확인했습니다."));
        assertThatCode(() -> ReviewClaimTextPatch.apply(fixture.mapper, original, complete)).doesNotThrowAnyException();
        var duplicate = (ObjectNode)fixture.mapper.readTree(complete);
        ((ObjectNode)duplicate.path("patches").get(1)).set("path", duplicate.path("patches").get(0).path("path"));
        assertThatThrownBy(() -> ReviewClaimTextPatch.apply(fixture.mapper, original, duplicate.toString()))
                .hasMessage("INVALID_REVIEW_CLAIM_TEXT_PATCH");
    }

    @Test void mixed_citation_annotation_preserves_the_recorded_literal_field() {
        var candidate = candidate();
        ((ObjectNode)candidate.at("/analysis/summary/0")).put("text", "선반을 열지 않았습니다(E16, E395 등 shelfOpened=false).");
        assertThat(ReviewClaimTextPatch.canRepair(fixture.mapper, candidate.toString(), failure)).isTrue();
        var valid = patch(Map.of("/analysis/summary/0/text", "선반을 열지 않았습니다(shelfOpened=false)."));
        var result = fixture.mapper.readTree(ReviewClaimTextPatch.apply(fixture.mapper, candidate.toString(), valid));
        assertThat(result.at("/analysis/summary/0/evidenceEventIds")).isEqualTo(candidate.at("/analysis/summary/0/evidenceEventIds"));
        assertThatThrownBy(() -> ReviewClaimTextPatch.apply(fixture.mapper, candidate.toString(),
                valid.replace("shelfOpened=false", "shelfOpened=true"))).hasMessage("INVALID_REVIEW_CLAIM_TEXT_PATCH");
    }

    @Test void pipeline_formats_annotations_without_another_model_call_and_preserves_the_original_response() {
        var bad = candidate();
        var client = client(bad);
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result = call(client, audit, false);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(audit).hasSize(1);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.getFirst().source()).isEqualTo("LIVE");
        assertThat(audit.getFirst().validationFailure().code()).isEqualTo("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble());
        verify(client,never()).complete(eq(ReviewClaimTextPatch.SYSTEM),anyString(),anyInt(),anyDouble());
    }

    @Test void local_formatting_preserves_every_other_json_value_and_rejects_non_annotation_references() {
        var original = candidate();
        ((ObjectNode)original.at("/analysis/findings/0/observation/0")).put("text", "선반은 닫혀 있습니다(E16, E395 등 shelfOpened=false).");
        var normalized = fixture.mapper.readTree(ReviewClaimTextPatch.normalizeAnnotations(fixture.mapper, original.toString(), failure));
        assertThat(normalized.at("/analysis/summary/0/text").asString()).isEqualTo("제공된 미션과 종료 기록입니다.");
        assertThat(normalized.at("/analysis/findings/0/observation/0/text").asString()).isEqualTo("선반은 닫혀 있습니다(shelfOpened=false).");
        for (String path : List.of("/analysis/summary/0", "/analysis/findings/0/observation/0"))
            ((ObjectNode)normalized.at(path)).set("text", original.at(path).path("text"));
        assertThat(normalized).isEqualTo(original);
        ((ObjectNode)original.at("/analysis/summary/0")).put("text", "E1부터 E6까지 순서를 확인했습니다.");
        assertThatThrownBy(() -> ReviewClaimTextPatch.normalizeAnnotations(fixture.mapper, original.toString(), failure))
                .hasMessage("INVALID_REVIEW_CLAIM_TEXT_PATCH");
    }

    @Test void annotation_cleanup_followed_by_empty_observations_and_limits_asks_model_again_without_filling_them() {
        var bad = candidate();
        ((ObjectNode)bad.path("analysis")).putArray("findings");
        ((ObjectNode)bad.path("analysis")).putArray("uncertainties");
        ((ObjectNode)bad.at("/analysis/practicePlan")).putArray("targetFindingIds");
        ((ObjectNode)bad.at("/analysis/practicePlan/rationale")).putArray("observed").addObject().put("findingId", "$summary").put("observationIndex", 0);
        ((ObjectNode)bad.at("/analysis/practicePlan/rationale")).putArray("unknownCauseIndexes");
        var good = bad.deepCopy();
        ((ObjectNode)good.path("analysis")).putArray("uncertainties").add("행동의 원인과 안내 이해 여부는 기록으로 확인되지 않았습니다.");
        var client = client(bad);
        when(client.complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(bad.toString(), "mock"),
                        new GroqChatClient.GroqChatResult(good.toString(), "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result = call(client, audit, false);
        assertThat(result.findings()).isEmpty();
        assertThat(result.uncertainties()).containsExactly("행동의 원인과 안내 이해 여부는 기록으로 확인되지 않았습니다.");
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(audit).hasSize(2);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.getLast().rawOutput()).isEqualTo(good.toString());
        verify(client).complete(eq(AnalysisReviewPrompt.system()), contains("ANALYSIS_OBSERVATIONS_OR_LIMITS_REQUIRED"), eq(2400), anyDouble());
    }

    @Test void empty_observations_and_limits_are_still_rejected_after_the_existing_retry_bound() {
        var bad = candidate();
        ((ObjectNode)bad.path("analysis")).putArray("findings");
        ((ObjectNode)bad.path("analysis")).putArray("uncertainties");
        ((ObjectNode)bad.at("/analysis/practicePlan")).putArray("targetFindingIds");
        ((ObjectNode)bad.at("/analysis/practicePlan/rationale")).putArray("observed").addObject().put("findingId", "$summary").put("observationIndex", 0);
        ((ObjectNode)bad.at("/analysis/practicePlan/rationale")).putArray("unknownCauseIndexes");
        var client = client(bad);
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client, audit, false)).hasMessage("INVALID_AI_ANALYSIS");
        assertThat(audit).hasSize(3);
        verify(client,times(3)).complete(eq(AnalysisReviewPrompt.system()), anyString(), eq(2400), anyDouble());
    }

    @Test void actual_v75_formatting_is_identical_to_the_previously_accepted_model_patch() throws Exception {
        var path=Path.of("../output/analysis-nine-cold-20261016/results/superseded-candidate-v75/adult-minjae-unit-support-research-v2-1-baseline-pre/model-calls.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
        var calls=fixture.mapper.readTree(Files.readString(path));
        String original=calls.get(2).path("rawOutput").asString(), modelPatch=calls.get(3).path("rawOutput").asString();
        String expected=ReviewClaimTextPatch.apply(fixture.mapper,original,modelPatch);
        assertThat(ReviewClaimTextPatch.normalizeAnnotations(fixture.mapper,original,failure)).isEqualTo(expected);
    }

    @Test void a_text_patch_still_must_pass_the_existing_source_and_independent_semantic_gates() {
        var bad = candidate();
        var client = client(bad);
        String rejection = """
                {"verdict":"REPAIR","checkedDimensions":["UNCERTAIN_CAUSES"],"issues":[{
                "code":"UNCONFIRMED_CAUSE","path":"/summary/0/text","quote":"제공된 미션과 종료 기록입니다.","explanation":"독립 검토 거절 fixture"}]}
                """;
        when(client.complete(eq(AnalysisPlanSemanticReview.system()), anyString(), eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS), eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(rejection, "mock"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> call(client,audit,true)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(audit.getLast().validationFailure().code()).isEqualTo("REVIEW_PLAN_SEMANTIC_MISMATCH");
        verify(client,never()).complete(eq(ReviewClaimTextPatch.SYSTEM),anyString(),anyInt(),anyDouble());

        var input = input();
        var refs = new AnalysisReferences(fixture.mapper,input);
        ((ObjectNode)bad.at("/analysis/summary/0")).putArray("evidenceEventIds").add("E999");
        String changed = ReviewClaimTextPatch.apply(fixture.mapper,bad.toString(),patch(Map.of("/analysis/summary/0/text", "제공된 미션과 종료 기록입니다.")));
        assertThatThrownBy(() -> AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,changed,refs))
                .hasMessage("UNKNOWN_REVIEW_EVIDENCE");
    }

    @Test void actual_seoyeon_failed_reviews_repair_only_annotations_and_preserve_any_next_contract_failure() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(OWN.resolve("analysis-repair-diagnostics/own-input-snapshots.json")));
        var snapshot = fixture.mapper.readTree(Files.readString(OWN.resolve("analysis-repair-diagnostics/own-input-snapshots.json"))).get(0);
        var wrapper = fixture.mapper.createObjectNode();
        wrapper.set("id",snapshot.path("id")); wrapper.set("schemaVersion",snapshot.path("schema_version"));
        wrapper.set("generatedAt",snapshot.path("input_data").path("generatedAt"));
        wrapper.set("sessionCount",snapshot.path("session_count")); wrapper.set("eventCount",snapshot.path("event_count"));
        wrapper.set("input",snapshot.path("input_data"));
        var input = fixture.mapper.treeToValue(wrapper,BehaviorAnalysisInputResponse.class);
        assertThat(input.eventCount()).isEqualTo(1846);
        assertThat(input.input().sessions().getFirst().sessionId().toString()).isEqualTo("dfcb901d-d527-4d88-9694-351243d29ff7");
        var refs = new AnalysisReferences(fixture.mapper,input);
        var first = actual(13);
        String source = first.path("inputPrompt").asString();
        var report = fixture.mapper.createObjectNode().put("actualModelCalls",0).put("newPlays",0)
                .put("originalEventCount",1846).put("scope","Existing Seoyeon recommendation-1 review fixtures; format repair only");
        var cases = report.putArray("cases");
        for (int number : List.of(13,15)) {
            var saved = actual(number);
            String original = saved.path("rawOutput").asString();
            var details = fixture.mapper.treeToValue(saved.path("validationFailure"),ReviewEvidenceException.Details.class);
            assertThat(ReviewClaimTextPatch.canRepair(fixture.mapper,original,details)).isTrue();
            assertThatThrownBy(() -> AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,original,refs))
                    .isInstanceOfSatisfying(ReviewEvidenceException.class, e -> assertThat(e.details()).isEqualTo(details));
            String response = actualPatch(number);
            String repaired = ReviewClaimTextPatch.apply(fixture.mapper,original,response);
            var originalTree = fixture.mapper.readTree(original);
            var repairedTree = fixture.mapper.readTree(repaired);
            for (var entry : fixture.mapper.readTree(response).path("patches")) {
                String path = entry.path("path").asString();
                ((ObjectNode)repairedTree.at(path.substring(0,path.lastIndexOf('/')))).set("text",originalTree.at(path));
            }
            assertThat(repairedTree).isEqualTo(originalTree);
            String prompt = ReviewClaimTextPatch.prompt(fixture.mapper,source,original,details);
            assertThat(prompt).startsWith(source).contains(original);
            int tokens = new AnalysisTokenBudget().total(ReviewClaimTextPatch.SYSTEM,prompt,ReviewClaimTextPatch.OUTPUT_TOKENS);
            assertThat(tokens).isLessThanOrEqualTo(24000);
            var row = cases.addObject().put("originalReviewAttempt",number).put("patchRequiredTokens",tokens)
                    .put("proseOutsideAnnotationsPreserved",true).put("evidenceAndJudgmentsPreserved",true);
            try {
                String normalized = AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,repaired,refs);
                var analysis = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(normalized),input);
                row.put("sourceContractStatus","VALID").put("taskJudgment",analysis.sessionAssessments().getFirst().judgment());
            } catch (ReviewEvidenceException next) {
                assertThat(next.details().code()).isNotEqualTo("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
                row.put("sourceContractStatus","REJECTED_AFTER_TEXT_PATCH"); row.set("nextValidationFailure",fixture.mapper.valueToTree(next.details()));
            }
            row.put("independentSemanticGatePassed",false).put("actualModelRepairVerified",false);
        }
        Files.writeString(OWN.resolve("analysis-repair-diagnostics/claim-text-patch-verification.json"),
                fixture.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        assertThat(cases.get(1).path("sourceContractStatus").asString()).isEqualTo("REJECTED_AFTER_TEXT_PATCH");
    }

    private ObjectNode candidate() {
        var value = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)value.at("/analysis/summary/0")).put("text","제공된 미션(E1)과 종료 기록(E4~E6)입니다.");
        return value;
    }
    private BehaviorAnalysisInputResponse input() {
        return fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);
    }
    private String source() {
        var input = input(); var refs = new AnalysisReferences(fixture.mapper,input);
        return AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,
                new AiBehaviorAnalysisPromptFactory(fixture.mapper),input,List.of(),refs,false),null,refs);
    }
    private GroqChatClient client(ObjectNode bad) {
        var client = mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(bad.toString(),"mock"));
        return client;
    }
    private AiBehaviorAnalysis call(GroqChatClient client,List<AiBehaviorAnalysisRun.Attempt> audit,boolean semantic) {
        var input = input(); var refs = new AnalysisReferences(fixture.mapper,input);
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),validator,client,fixture.mapper)
                .withQualityReview(true).withPlanSemanticReview(semantic);
        Function<String,AiBehaviorAnalysis> parse = raw -> validator.validate(refs.read(
                AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        return ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source(),2400,24000,audit,parse,false,3);
    }
    private String patch(Map<String,String> texts) {
        var root = fixture.mapper.createObjectNode(); var patches = root.putArray("patches");
        texts.forEach((path,text) -> patches.addObject().put("path",path).put("value",text));
        return root.toString();
    }
    private JsonNode actual(int number) throws Exception {
        return fixture.mapper.readTree(Files.readString(OWN.resolve("review-format-failure-8f9e422b-1eb9-42ce-8b9c-de8f04af84bb-"+number+".json")));
    }
    private String actualPatch(int number) {
        if (number == 13) return patch(Map.of(
                "/analysis/summary/1/text","장바구니를 11회 개폐했으나, 내부 항목 수와 총액은 0으로 유지되었으며 세션 종료 시 비어있었습니다.",
                "/analysis/findings/0/alternativeExplanations/0/text","장바구니 개폐 빈도가 높았으나, 실제 상품 추가 행사가 기록되지 않아 선택 시도 여부 확인 불가입니다.",
                "/analysis/findings/1/observation/0/text","common-door 및 exit 근처를 반복적으로 방문했으나, 목표 매대 접근 기록이 없습니다."));
        return patch(Map.of(
                "/analysis/summary/0/text","제한 시간 시작 후 학습자는 produce 매대 근처 및 common-door/exit 영역을 오가며 이동했습니다. 장바구니를 여러 번 열었지만, 상품 추가나 수량 변경 사건은 기록되지 않았습니다. 세션 종료 시점 장바구니는 비어 있고 결제 제출도 없었습니다.",
                "/analysis/findings/1/observation/0/text","produce 매대 근처 좌표와 common-door/exit 근접이 관찰되나, fresh 매대(우유 위치) 접근 증거는 명확하지 않습니다."));
    }
}
