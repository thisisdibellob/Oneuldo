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

class ReviewSemanticTextPatchTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private static final String PATH="/findings/0/interpretation/0/text";
    private static final String BAD="목표 매대 위치는 인지하고 접근했으나, 상품 선택으로 이어지지 않았습니다.";
    private static final String GOOD="목표 위치를 인지했는지는 원본 기록으로 확인할 수 없습니다.";
    private static final Path OWN=Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-2/analysis-repair-diagnostics");

    @Test void only_one_exact_reviewed_prose_path_can_change_and_every_other_value_is_literal() {
        var candidate=bad();String review=review("REPAIR",PATH,BAD);
        String response=patch("/analysis"+PATH,GOOD);
        var after=fixture.mapper.readTree(ReviewSemanticTextPatch.apply(fixture.mapper,candidate.toString(),review,response));
        ((ObjectNode)after.at("/analysis/findings/0/interpretation/0")).set("text",candidate.at("/analysis"+PATH));
        assertThat(after).isEqualTo(candidate);
        for(String rejected:List.of(response.replace("/analysis"+PATH,"/analysis/sessionAssessments/0/judgment"),
                response.replace("/analysis"+PATH,"/analysis/findings/0/id"),response.replace("/analysis"+PATH,"/analysis/findings/0/interpretation/0/evidenceEventIds"),
                response.replace("/analysis"+PATH,"/analysis/practicePlan/recommendedDifficulty"),response+" {}",
                response.substring(0,response.length()-1)+",\"analysis\":{}}"))
            assertThatThrownBy(()->ReviewSemanticTextPatch.apply(fixture.mapper,candidate.toString(),review,rejected))
                    .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
        for(String invalid:List.of(review.replace(BAD,"원문에 없는 인용"),review.replace("UNCONFIRMED_COGNITION","UNRECORDED_ACTION_HYPOTHESIS"),
                review.replace(PATH,"/sessionAssessments/0/judgment")))
            assertThatThrownBy(()->ReviewSemanticTextPatch.target(fixture.mapper,candidate.toString(),invalid))
                    .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
        String fragmentReview=review("REPAIR",PATH,"인지하고 접근했으나");
        String preservesFacts="목표 매대 위치는 인지했는지 확인할 수 없으나, 상품 선택으로 이어지지 않았습니다.";
        assertThatCode(()->ReviewSemanticTextPatch.apply(fixture.mapper,candidate.toString(),fragmentReview,patch("/analysis"+PATH,preservesFacts)))
                .doesNotThrowAnyException();
        for(String changed:List.of(preservesFacts.replace("상품 선택으로 이어지지 않았습니다.","상품 2개를 선택했습니다."),
                preservesFacts.replace("목표 매대 위치는","세 매대 위치는")))
            assertThatThrownBy(()->ReviewSemanticTextPatch.apply(fixture.mapper,candidate.toString(),fragmentReview,patch("/analysis"+PATH,changed)))
                    .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
        var ambiguous=bad();((ObjectNode)ambiguous.at("/analysis/findings/0/interpretation/0")).put("text",BAD+" "+BAD);
        assertThatThrownBy(()->ReviewSemanticTextPatch.target(fixture.mapper,ambiguous.toString(),review))
                .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
    }

    @Test void an_owner_mismatch_the_reviewer_quotes_gets_the_same_single_path_rewrite() {
        var candidate=bad();
        for(String code:List.of("EXECUTION_OWNER_MISMATCH")) {
            String review=review("REPAIR",PATH,BAD).replace("UNCONFIRMED_COGNITION",code);
            assertThat(ReviewSemanticTextPatch.target(fixture.mapper,candidate.toString(),review).path()).isEqualTo("/analysis"+PATH);
            var after=fixture.mapper.readTree(ReviewSemanticTextPatch.apply(fixture.mapper,candidate.toString(),review,patch("/analysis"+PATH,GOOD)));
            ((ObjectNode)after.at("/analysis/findings/0/interpretation/0")).set("text",candidate.at("/analysis"+PATH));
            assertThat(after).isEqualTo(candidate);
        }
        // A cause wording belongs to the cause and alternative-explanation patches; a never-recorded action is not something a rewrite can settle.
        for(String code:List.of("UNCONFIRMED_CAUSE","UNRECORDED_ACTION_HYPOTHESIS"))
            assertThatThrownBy(()->ReviewSemanticTextPatch.target(fixture.mapper,candidate.toString(),review("REPAIR",PATH,BAD).replace("UNCONFIRMED_COGNITION",code)))
                .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
    }
    @Test void a_bad_patch_is_audited_then_one_model_string_repair_is_reviewed_and_only_its_real_response_is_checkpointed() {
        var bad=bad();var client=client(bad);var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        String malformed=patch("/analysis/sessionAssessments/0/judgment","SUCCESS");
        String good=patch("/analysis"+PATH,GOOD);
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(ReviewSemanticTextPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(malformed,"mock"),new GroqChatClient.GroqChatResult(good,"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review("REPAIR",PATH,BAD),"mock"),new GroqChatClient.GroqChatResult(review("VALID",PATH,GOOD),"mock"));
        var checkpoints=new ArrayList<GroqChatClient.GroqChatResult>();
        AnalysisCheckpoints store=new AnalysisCheckpoints() {
            public Optional<GroqChatClient.GroqChatResult> find(String system,String prompt,int output) { return Optional.empty(); }
            public void save(String system,String prompt,int output,GroqChatClient.GroqChatResult response) {
                assertThat(system).isEqualTo(ReviewSemanticTextPatch.SYSTEM);assertThat(output).isEqualTo(512);
                checkpoints.add(response);
            }
        };
        var result=call(client,audit,store);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings().getFirst().interpretation()).isEqualTo(GOOD);
        assertThat(audit).hasSize(5);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.get(2).rawOutput()).isEqualTo(malformed);
        assertThat(audit.get(3).inputPrompt()).startsWith(source()).contains(bad.toString()).doesNotContain(malformed);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(checkpoints).singleElement().satisfies(response->assertThat(response.text()).isEqualTo(good));
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble());
    }

    @Test void source_format_errors_from_the_model_string_cannot_be_accepted_or_poison_other_fields() {
        var client=client(bad());
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(ReviewSemanticTextPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch("/analysis"+PATH,GOOD+"(E999)"),"mock"),
                        new GroqChatClient.GroqChatResult(patch("/analysis"+PATH,GOOD),"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review("REPAIR",PATH,BAD),"mock"),new GroqChatClient.GroqChatResult(review("VALID",PATH,GOOD),"mock"));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThat(call(client,audit,AnalysisCheckpoints.NONE).findings().getFirst().interpretation()).isEqualTo(GOOD);
        assertThat(audit.get(2).validationFailure().code()).isEqualTo("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
        assertThat(audit.get(3).inputPrompt()).contains(bad().toString());
        verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble());
    }

    @Test void three_semantically_rejected_patches_stop_and_none_is_saved_as_a_valid_checkpoint() {
        var client=client(bad());
        when(client.complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(ReviewSemanticTextPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(patch("/analysis"+PATH,BAD),"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review("REPAIR",PATH,BAD),"mock"));
        AnalysisCheckpoints store=mock(AnalysisCheckpoints.class);
        when(store.find(anyString(),anyString(),anyInt())).thenReturn(Optional.empty());
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(()->call(client,audit,store)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        assertThat(audit).hasSize(8);
        verify(client,times(3)).complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),eq(ReviewSemanticTextPatch.OUTPUT_TOKENS),eq(0.0));
        verify(store,never()).save(anyString(),anyString(),anyInt(),any());
    }

    @Test void a_raw_patch_checkpoint_is_revalidated_against_source_and_independent_semantics() {
        var client=client(bad());String response=patch("/analysis"+PATH,GOOD);
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(review("REPAIR",PATH,BAD),"mock"),new GroqChatClient.GroqChatResult(review("VALID",PATH,GOOD),"mock"));
        AnalysisCheckpoints store=new AnalysisCheckpoints() {
            public Optional<GroqChatClient.GroqChatResult> find(String system,String prompt,int output) {
                return ReviewSemanticTextPatch.SYSTEM.equals(system)?Optional.of(new GroqChatClient.GroqChatResult(response,"cached-model")):Optional.empty();
            }
            public void save(String system,String prompt,int output,GroqChatClient.GroqChatResult value) { assertThat(value.text()).isEqualTo(response); }
        };
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThat(call(client,audit,store).findings().getFirst().interpretation()).isEqualTo(GOOD);
        assertThat(audit.get(2).source()).isEqualTo("REVIEW_SEMANTIC_TEXT_PATCH_CHECKPOINT");
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        verify(client,never()).complete(eq(ReviewSemanticTextPatch.SYSTEM),anyString(),anyInt(),anyDouble());
        verify(client,times(2)).complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0));
    }

    @Test void actual_v62_cognition_issue_uses_full_source_and_candidate_without_rewriting_valid_annotations_or_grades() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(OWN.resolve("own-analyses-original-through-v62.json")));
        String originalBytes=Files.readString(OWN.resolve("own-analyses-original-through-v62.json"));
        JsonNode saved=null;
        for(var row:fixture.mapper.readTree(originalBytes))if("da3ce548-61bd-4e1a-aed9-b0541e030b6f".equals(row.path("id").asString()))saved=row;
        assertThat(saved).isNotNull();
        var attempts=saved.path("attempts");if(attempts.isString())attempts=fixture.mapper.readTree(attempts.asString());
        String source=attempts.get(17).path("inputPrompt").asString(),candidate=attempts.get(18).path("rawOutput").asString();
        String review=attempts.get(19).path("rawOutput").asString();
        String actualPath="/findings/1/interpretation/0/text";
        var data=fixture.mapper.treeToValue(fixture.mapper.readTree(Files.readString(OWN.resolve("own-input-snapshot-2345-original.json"))).path("input_data"),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        var refs=new AnalysisReferences(fixture.mapper,input);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        assertThat(data.eventCount()).isEqualTo(2345);
        assertThat(data.sessions().getFirst().sessionId().toString()).isEqualTo("8e6caef7-ccf9-4727-bee1-c0d7de6a37df");
        assertThatCode(()->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,candidate,refs)),input)).doesNotThrowAnyException();
        AnalysisPlanSemanticReview.Rejected issue;
        try { AnalysisPlanSemanticReview.validate(fixture.mapper,review,candidate,source);throw new AssertionError("Existing independent rejection is required"); }
        catch(AnalysisPlanSemanticReview.Rejected rejected) { issue=rejected; }
        assertThat(ReviewSemanticTextPatch.canRepair(fixture.mapper,candidate,issue)).isTrue();
        String prompt=ReviewSemanticTextPatch.prompt(fixture.mapper,source,candidate,issue.review());
        assertThat(prompt).startsWith(source).contains(candidate);
        String mockedText="도움 기능을 인지하고 활용하려는 의도가 있었는지는 원본 기록으로 확인할 수 없으나, 이를 통해 목표 상품을 획득하는 데는 연결되지 않았습니다.";
        String patch=patch("/analysis"+actualPath,mockedText);
        String repaired=ReviewSemanticTextPatch.apply(fixture.mapper,candidate,issue.review(),patch);
        var after=fixture.mapper.readTree(repaired);var original=fixture.mapper.readTree(candidate);
        var result=validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,repaired,refs)),input);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        ((ObjectNode)after.at("/analysis/findings/1/interpretation/0")).set("text",original.at("/analysis"+actualPath));
        assertThat(after).isEqualTo(original);
        int base=new AnalysisTokenBudget().total(ReviewSemanticTextPatch.SYSTEM,prompt,512)+512;
        String retry="\nRepair attempt 2: previous patch failed its string contract. Return one allowedTextPath string, concise Korean, no inline E IDs; all other candidate fields stay unchanged.";
        int retried=new AnalysisTokenBudget().total(ReviewSemanticTextPatch.SYSTEM,prompt+retry,512)+512;
        assertThat(base).isLessThanOrEqualTo(24000);assertThat(retried).isLessThanOrEqualTo(24000);
        assertThat(Files.readString(OWN.resolve("own-analyses-original-through-v62.json"))).isEqualTo(originalBytes);
        var report=fixture.mapper.createObjectNode().put("actualModelCalls",0).put("newPlays",0).put("originalAnalysisId",saved.path("id").asString())
                .put("originalEventCount",2345).put("targetPath","/analysis"+actualPath).put("allOtherFieldsGradeAndEvidenceUnchanged",true)
                .put("sourceGateAfterMockPatch","VALID").put("baseWith512OutputAnd512Buffer",base).put("retryWith512OutputAnd512Buffer",retried)
                .put("actualIndependentModelApprovalVerified",false).put("oldFailedRecordsReclassified",false);
        Files.writeString(OWN.resolve("semantic-string-patch-budget-verification.json"),fixture.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }

    private ObjectNode bad() {
        var candidate=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)candidate.at("/analysis/findings/0/interpretation/0")).put("text",BAD);return candidate;
    }
    private String patch(String path,String value) {
        var root=fixture.mapper.createObjectNode();root.putArray("patches").addObject().put("path",path).put("value",value);return root.toString();
    }
    private String review(String verdict,String path,String text) {
        var root=fixture.mapper.createObjectNode().put("verdict",verdict);
        root.set("checkedDimensions",fixture.mapper.valueToTree(List.of("SUPPORT_CAPABILITIES","STATION_IDENTITY","UNCERTAIN_CAUSES")));
        var issues=root.putArray("issues");
        if("REPAIR".equals(verdict))issues.addObject().put("code","UNCONFIRMED_COGNITION").put("path",path).put("quote",text).put("explanation","원본 기록은 인지를 확인하지 않습니다.");
        root.putArray("cognitionChecks").addObject().put("path",path).put("status","REPAIR".equals(verdict)?"UNSUPPORTED_ASSERTION":"UNCERTAIN_OR_PROPOSED").putNull("sourcePath");
        return root.toString();
    }
    private BehaviorAnalysisInputResponse input() { return fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class); }
    private String source() {
        var input=input();var refs=new AnalysisReferences(fixture.mapper,input);var prompts=new AiBehaviorAnalysisPromptFactory(fixture.mapper);
        return AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,prompts,input,List.of(),refs,false),null,refs);
    }
    private GroqChatClient client(ObjectNode bad) {
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(bad.toString(),"mock"));
        return client;
    }
    private AiBehaviorAnalysis call(GroqChatClient client,List<AiBehaviorAnalysisRun.Attempt> audit,AnalysisCheckpoints store) {
        var input=input();var refs=new AnalysisReferences(fixture.mapper,input);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(true).withCheckpoints(store);
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        return ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source(),2400,24000,audit,parse,false,3);
    }
}
