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

class AlternativeCauseSourceChecksTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private static final String CAUSE_PATH="/findings/0/alternativeExplanations/0/text";
    private static final String ARRAY="/analysis/findings/0/alternativeExplanations";

    @Test void help_opening_or_empty_cart_and_null_error_do_not_establish_an_alternative_cause() {
        for(String text:List.of("도움말을 이해하지 못했거나 사용법을 모를 수 있습니다.","시스템 오류로 장바구니에 반영되지 않았을 수 있습니다.",
                "도움말 열람 후 탐색 중단은 인지 부하 때문일 수 있습니다.","조작 어려움으로 인해 선택 버튼 누르지 못했을 수 있습니다.")) {
            var candidate=candidate(text);String original=candidate.toString();var source=source();String review=valid(candidate);
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,review,original,source.toString()))
                    .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class,rejected->{
                        assertThat(rejected.review()).isEqualTo(review);
                        assertThat(rejected.sourceBoundIssue().code()).isEqualTo("UNSUPPORTED_ALTERNATIVE_SOURCE");
                        assertThat(rejected.sourceBoundIssue().path()).isEqualTo(CAUSE_PATH);
                        assertThat(rejected.sourceBoundIssue().quote()).isEqualTo(text);
                        assertThat(ReviewAlternativeExplanationPatch.canRepair(fixture.mapper,original,rejected)).isTrue();
                        assertThat(ReviewSemanticTextPatch.canRepair(fixture.mapper,original,rejected)).isFalse();
                    });
            assertThat(candidate.toString()).isEqualTo(original);
        }
    }

    @Test void cognitive_load_needs_an_attributed_literal_report_not_merely_an_understanding_flag() {
        var source=source();
        ((ObjectNode)source.at("/sourceEventDetails/0")).putObject("userExperience").put("instructionUnderstood",false);
        var noReport=candidate("인지 부하 때문일 수 있다는 기록입니다.");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,valid(noReport),noReport.toString(),source.toString()))
                .isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        ((ObjectNode)source.at("/sourceEventDetails/0/userExperience")).put("feedbackNote","인지 부하가 느껴졌습니다");
        var reported=candidate("인지 부하가 느껴졌습니다 라는 응답이 기록되어 있으며, 실제 원인은 미확인입니다.");
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,withCauseProof(reported,source),reported.toString(),source.toString()))
                .doesNotThrowAnyException();
    }

    @Test void an_attributed_literal_report_and_matching_recorded_render_error_can_be_checked_without_inventing_a_cause() {
        var source=source();((ObjectNode)source.at("/sourceEventDetails/0")).putObject("userExperience").put("instructionUnderstood",false);
        var candidate=candidate("도움말을 이해하지 못했다고 응답한 기록이 있어 선택이 어려웠을 가능성이 있습니다.");
        String reviewed=withCauseProof(candidate,source);
        String reportCandidate=candidate.toString();
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,reviewed,reportCandidate,source.toString())).doesNotThrowAnyException();
        ((ObjectNode)source.at("/sourceEventDetails/0")).remove("userExperience");
        ((ObjectNode)source.at("/sourceEventDetails/0")).put("renderErrorCode","CANVAS_FRAME_FAILED");
        candidate=candidate("렌더링 오류 CANVAS_FRAME_FAILED가 기록되어 화면 갱신이 어려웠을 가능성이 있습니다.");
        String faultReview=withCauseProof(candidate,source);String faultCandidate=candidate.toString();
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,faultReview,faultCandidate,source.toString())).doesNotThrowAnyException();
    }

    @Test void proofs_must_match_the_exact_cited_event_field_and_value_and_null_is_not_a_fault() {
        var source=source();((ObjectNode)source.at("/sourceEventDetails/0")).putObject("userExperience").put("instructionUnderstood",false);
        var candidate=candidate("도움말을 이해하지 못했다고 응답한 기록이 있어 선택이 어려웠을 가능성이 있습니다.");
        String valid=withCauseProof(candidate,source);
        for(String bad:List.of(valid.replace("/sourceEventDetails/0/userExperience/instructionUnderstood","/sourceEventDetails/99/userExperience/instructionUnderstood"),
                valid.replace("\"eventId\":\"E1\"","\"eventId\":\"E999\""),valid.replace("\"sourceValue\":false","\"sourceValue\":true")))
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,bad,candidate.toString(),source.toString()))
                    .hasMessage("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
        var fault=candidate("시스템 오류가 기록되어 장바구니 갱신에 실패했을 수 있습니다.");
        ((ObjectNode)source.at("/sourceEventDetails/0")).putNull("renderErrorCode");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,valid(fault),fault.toString(),source.toString()))
                .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class,r->assertThat(r.sourceBoundIssue().code()).isEqualTo("UNSUPPORTED_ALTERNATIVE_SOURCE"));
    }

    @Test void unknowns_and_future_observation_questions_remain_unknown_and_are_not_array_repair_targets() {
        var candidate=candidate("관측된 미션 조건의 다른 설명입니다.");
        ((ArrayNode)candidate.at(ARRAY)).removeAll();
        ((ObjectNode)candidate.path("analysis")).putArray("uncertainties").add("도움말을 이해하지 못했는지나 시스템 오류 가능성은 직접 기록으로 확인되지 않았습니다.");
        ((ObjectNode)candidate.at("/analysis/practicePlan/rationale")).put("proposedPractice","다음에는 안내를 이해하는지와 실제 기기 오류가 있는지 관찰합니다.");
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,valid(candidate),candidate.toString(),source().toString())).doesNotThrowAnyException();
    }

    @Test void exact_reported_nonempty_row_only_can_be_removed_by_a_model_array_with_every_other_value_fixed() {
        var candidate=candidate("도움말을 이해하지 못했을 수 있습니다.");
        var rows=(ArrayNode)candidate.at(ARRAY);rows.addObject().put("text","기존 근거에 연결된 다른 대안입니다.").putArray("evidenceEventIds").add("E2");
        var rejection=rejection(candidate,source());String original=candidate.toString();
        var retained=fixture.mapper.createArrayNode().add(rows.get(1).deepCopy());String response=patch(retained,null);
        var after=fixture.mapper.readTree(ReviewAlternativeExplanationPatch.apply(fixture.mapper,original,rejection,response));
        assertThat(after.at(ARRAY)).isEqualTo(retained);
        ((ObjectNode)after.at("/analysis/findings/0")).set("alternativeExplanations",rows);
        assertThat(after).isEqualTo(candidate);
        assertThat(ReviewAlternativeExplanationPatch.prompt(fixture.mapper,source().toString(),original,rejection))
                .startsWith(source()+"\nCandidate (all values retained): "+original).contains("SOURCE_BOUND_ROW",rejection.review());
        for(String bad:List.of(patch(fixture.mapper.createArrayNode(),null),patch(rows,null),
                response.replace("기존 근거에 연결된 다른 대안입니다.","새 원인입니다."),
                response.replace("\"E2\"","\"E999\""),response.replace(ARRAY,"/analysis/findings/1/alternativeExplanations"))) {
            if(bad.equals(response))continue;
            assertThatThrownBy(()->ReviewAlternativeExplanationPatch.apply(fixture.mapper,original,rejection,bad)).hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
        }
    }

    @Test void generic_model_cause_review_is_not_privileged_to_delete_an_arbitrary_alternative() {
        var candidate=candidate("선택 이유는 확인되지 않은 가설입니다.");
        var raw=fixture.mapper.createObjectNode().put("verdict","REPAIR");raw.putArray("checkedDimensions").add("UNCERTAIN_CAUSES");
        raw.putArray("issues").addObject().put("code","UNCONFIRMED_CAUSE").put("path",CAUSE_PATH).put("quote","선택 이유").put("explanation","일반 원인 검토");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,raw.toString(),candidate.toString(),source().toString()))
                .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class,rejected->
                        assertThat(ReviewAlternativeExplanationPatch.canRepair(fixture.mapper,candidate.toString(),rejected)).isFalse());
    }

    @Test void pipeline_uses_only_real_mock_responses_for_bounded_array_repair_then_rechecks_sources_and_semantics() {
        var candidate=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        var rows=((ObjectNode)candidate.at("/analysis/findings/0")).putArray("alternativeExplanations");
        rows.addObject().put("text","제공된 과제 조건에 연결된 다른 대안입니다.").putArray("evidenceEventIds").add("E1");
        rows.addObject().put("text","도움말을 이해하지 못했을 수 있습니다.").putArray("evidenceEventIds").add("E1");
        var retained=fixture.mapper.createArrayNode().add(rows.get(0).deepCopy());
        var unknowns=(ArrayNode)candidate.at("/analysis/uncertainties").deepCopy();unknowns.add("이해 수준의 직접 보고는 기록되지 않아 원인은 미확인입니다.");
        String good=patch(retained,unknowns),bad=patch(fixture.mapper.createArrayNode(),null);
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(candidate.toString(),"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),anyInt(),eq(0.0))).thenAnswer(call->{
            var supplied=fixture.mapper.readTree(call.getArgument(1,String.class)).path("candidate");
            var envelope=fixture.mapper.createObjectNode();envelope.set("analysis",supplied);return new GroqChatClient.GroqChatResult(valid(envelope),"mock");
        });
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM),anyString(),anyInt(),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(bad,"mock"),new GroqChatClient.GroqChatResult(good,"mock"));
        var input=fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);var refs=new AnalysisReferences(fixture.mapper,input);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());var factory=new AiBehaviorAnalysisPromptFactory(fixture.mapper);
        String source=AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,factory,input,List.of(),refs,false),null,refs);
        var pipeline=new TimelineAnalysisPipeline(factory,validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(true);
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        AiBehaviorAnalysis result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source,2400,24000,audit,parse,false,3);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(result.findings().getFirst().alternativeExplanations()).containsExactly("제공된 과제 조건에 연결된 다른 대안입니다.");
        assertThat(audit.stream().filter(row->"REVIEW_ALTERNATIVE_SOURCE_PATCH".equals(row.source())).map(AiBehaviorAnalysisRun.Attempt::rawOutput)).containsExactly(bad,good);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        assertThat(audit.getFirst().rawOutput()).isEqualTo(candidate.toString());
        verify(client,times(2)).complete(eq(ReviewAlternativeExplanationPatch.SYSTEM),anyString(),anyInt(),eq(0.0));
    }

    @Test void literal_nonnull_render_error_survives_the_final_source_projection() {
        var original=fixture.fixture();((ObjectNode)original.at("/input/sessions/0/events/0")).putObject("presentation").put("screenId","TEST").put("renderErrorCode","CANVAS_FRAME_FAILED");
        ((ObjectNode)original.at("/input/sessions/0/events/0/action")).put("eventCode","SHOP.GENERAL_HELP_OPENED");
        var details=SourceEventDetails.build(fixture.mapper,fixture.input(original));
        assertThat(details.get(0).path("renderErrorCode").asString()).isEqualTo("CANVAS_FRAME_FAILED");
    }

    @Test void a_direct_fault_on_a_position_sample_is_not_lost_and_its_literal_position_is_preserved() {
        var original=fixture.fixture();((ObjectNode)original.at("/input/sessions/0/events/0")).putObject("presentation")
                .put("screenId","TEST").put("renderErrorCode","CANVAS_FRAME_FAILED");
        var details=SourceEventDetails.build(fixture.mapper,fixture.input(original));
        assertThat(details).hasSize(1);
        assertThat(details.get(0).path("eventCode").asString()).isEqualTo("SHOP.MOVEMENT_SAMPLED");
        assertThat(details.get(0).path("renderErrorCode").asString()).isEqualTo("CANVAS_FRAME_FAILED");
        assertThat(details.get(0).path("x").asInt()).isEqualTo(0);assertThat(details.get(0).path("y").asInt()).isEqualTo(0);
    }

    @Test void three_invalid_source_bound_array_responses_stop_and_never_delete_supported_rows_in_code() {
        var candidate=candidate("도움말을 이해하지 못했을 수 있습니다.");
        ((ArrayNode)candidate.at(ARRAY)).addObject().put("text","기존 근거에 연결된 다른 대안입니다.").putArray("evidenceEventIds").add("E2");
        var issue=rejection(candidate,source());var client=mock(GroqChatClient.class);
        String bad=patch(fixture.mapper.createArrayNode(),null);
        when(client.complete(eq(ReviewAlternativeExplanationPatch.SYSTEM),anyString(),anyInt(),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(bad,"mock"));
        var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,fixture.mapper)
                .withQualityReview(true).withPlanSemanticReview(true);var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        Function<String,JsonNode> parse=fixture.mapper::readTree;
        assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(pipeline,"repairReviewCauseAlternatives",source().toString(),candidate.toString(),issue,24000,audit,parse))
                .hasMessage("INVALID_REVIEW_ALTERNATIVE_PATCH");
        assertThat(audit).hasSize(3).allSatisfy(row->assertThat(row.rawOutput()).isEqualTo(bad));
        assertThat(candidate.at(ARRAY)).hasSize(2);
        verify(client,times(3)).complete(eq(ReviewAlternativeExplanationPatch.SYSTEM),anyString(),anyInt(),eq(0.0));
        verify(client,never()).complete(eq(AnalysisPlanSemanticReview.system()),anyString(),anyInt(),anyDouble());
    }

    private ObjectNode candidate(String text) {
        var candidate=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)candidate.at("/analysis/findings/0")).putArray("alternativeExplanations").addObject().put("text",text).putArray("evidenceEventIds").add("E1");return candidate;
    }
    private ObjectNode source() {
        var root=fixture.mapper.createObjectNode();root.putArray("sourceEventDetails").addObject().put("id","E1").put("sessionId","S1").put("timeMs",100)
                .put("eventCode","SHOP.GENERAL_HELP_OPENED").putNull("renderErrorCode").put("cartItemCount",0).putObject("cart");return root;
    }
    private String valid(JsonNode candidate) {
        var root=fixture.mapper.createObjectNode().put("verdict","VALID");root.set("checkedDimensions",fixture.mapper.valueToTree(AnalysisPlanSemanticReview.DIMENSIONS));root.putArray("issues");
        var cognitive=root.putArray("cognitionChecks");
        for(String path:CognitionReviewClaims.locate(fixture.mapper,candidate.toString()).keySet())cognitive.addObject().put("path",path).put("status","UNCERTAIN_OR_PROPOSED").putNull("sourcePath");return root.toString();
    }
    private String withCauseProof(ObjectNode candidate,ObjectNode source) {
        var root=(ObjectNode)fixture.mapper.readTree(valid(candidate));var bound=root.putObject("sourceBoundChecks");bound.putArray("stations");bound.putArray("capabilities");var supplied=bound.putArray("alternatives");
        for(var claim:AlternativeCauseSourceChecks.claims(fixture.mapper,candidate.toString(),source)) {
            var row=supplied.addObject().put("path",claim.path()).put("quote",claim.quote());row.set("proofs",fixture.mapper.valueToTree(claim.literalProofOptions()));
        }
        return root.toString();
    }
    private AnalysisPlanSemanticReview.Rejected rejection(ObjectNode candidate,ObjectNode source) {
        try{AnalysisPlanSemanticReview.validate(fixture.mapper,valid(candidate),candidate.toString(),source.toString());throw new AssertionError("Expected source-bound rejection");}
        catch(AnalysisPlanSemanticReview.Rejected rejected){return rejected;}
    }
    private String patch(JsonNode rows,JsonNode unknowns) {
        var root=fixture.mapper.createObjectNode();var patches=root.putArray("patches");patches.addObject().put("path",ARRAY).set("value",rows);
        if(unknowns!=null)patches.addObject().put("path","/analysis/uncertainties").set("value",unknowns);return root.toString();
    }
}
