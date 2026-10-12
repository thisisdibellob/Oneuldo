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

class CognitionReviewClaimsTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private static final String PATH="/findings/0/interpretation/0/text";
    private static final String CLAIM="목표 매대 위치는 인지하고 접근했으나, 상품 선택으로 이어지지 않았습니다.";
    private static final Path OWN=Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-1/analysis-repair-diagnostics");
    private final String valid="{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}";

    @Test void an_unqualified_cognition_claim_cannot_hide_behind_valid_or_unrelated_uncertainty() {
        for(String text:List.of(CLAIM,"목표 위치는 인지하고 접근했으나, 상품 선택 원인은 미확인입니다.",
                "목표 위치는 인지하고 접근했으나 상품 선택 원인은 미확인입니다.")) {
            var candidate=candidate(text); String original=candidate.toString();
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,valid,original))
                    .hasMessage("REVIEW_COGNITION_CHECK_REQUIRED");
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,approval(PATH,"UNCERTAIN_OR_PROPOSED",null),original))
                    .hasMessage("REVIEW_UNCONFIRMED_COGNITION");
            assertThat(candidate.toString()).isEqualTo(original);
        }
    }

    @Test void explicit_unknown_cognition_and_future_questions_remain_valid() {
        for(String text:List.of("목표 위치를 인지하고 접근했는지는 확인할 수 없습니다.","목표를 이해했는지는 미확인입니다.","목표 인지 여부는 확인되지 않았습니다.")) {
            var candidate=candidate(text);
            assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,approval(PATH,"UNCERTAIN_OR_PROPOSED",null),candidate.toString()))
                    .doesNotThrowAnyException();
        }
        var candidate=candidate("인지했는지는 미확인입니다.");
        ((ObjectNode)candidate.at("/analysis/practicePlan")).put("goal","다음에 목표를 이해하고 선택하는지 관찰할 계획입니다.");
        var review=(ObjectNode)fixture.mapper.readTree(approval(PATH,"UNCERTAIN_OR_PROPOSED",null));
        ((tools.jackson.databind.node.ArrayNode)review.path("cognitionChecks")).addObject().put("path","/practicePlan/goal")
                .put("status","UNCERTAIN_OR_PROPOSED").putNull("sourcePath");
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,review.toString(),candidate.toString())).doesNotThrowAnyException();
    }

    @Test void a_recorded_experience_context_requires_the_exact_original_field_and_literal_value() {
        var candidate=candidate("클라이언트 경험 context에는 안내를 이해했다고 응답한 것으로 기록되어 있습니다. 실제 응답 주체는 미확인입니다.");
        String source="{\"sourceEventDetails\":[{\"id\":\"E1\",\"userExperience\":{\"instructionUnderstood\":true},\"recordedStation\":{\"kind\":\"shelf\"}}]}";
        String reportPath="/sourceEventDetails/0/userExperience/instructionUnderstood";
        var good=(ObjectNode)fixture.mapper.readTree(approval(PATH,"REPORTED_EXPERIENCE",reportPath));
        ((ObjectNode)good.path("cognitionChecks").get(0)).put("reportedValue",true);
        assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,good.toString(),candidate.toString(),source)).doesNotThrowAnyException();
        for(String bad:List.of(good.toString().replace(reportPath,"/sourceEventDetails/0/recordedStation/kind"),
                good.toString().replace("\"reportedValue\":true","\"reportedValue\":false")))
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,bad,candidate.toString(),source))
                    .hasMessage("REVIEW_UNCONFIRMED_COGNITION");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,good.toString(),candidate(CLAIM).toString(),source))
                .hasMessage("REVIEW_UNCONFIRMED_COGNITION");
    }

    @Test void support_and_practice_paths_cannot_bypass_past_cognition_checks() {
        for(String path:List.of("/practicePlan/goal","/practicePlan/rationale/proposedPractice","/findings/0/suggestedSupport")) {
            var candidate=candidate("동기는 미확인입니다.");
            String full="/analysis"+path;
            ((ObjectNode)candidate.at(full.substring(0,full.lastIndexOf('/')))).put(full.substring(full.lastIndexOf('/')+1),
                    "목표 위치를 인지했으므로 다음 연습의 안내를 줄입니다.");
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,approval(path,"UNCERTAIN_OR_PROPOSED",null),candidate.toString()))
                    .hasMessage("REVIEW_UNCONFIRMED_COGNITION");
            ((ObjectNode)candidate.at(full.substring(0,full.lastIndexOf('/')))).put(full.substring(full.lastIndexOf('/')+1),
                    "다음 연습에서 목표를 인지하고 접근하는지 확인합니다.");
            assertThatCode(()->AnalysisPlanSemanticReview.validate(fixture.mapper,approval(path,"UNCERTAIN_OR_PROPOSED",null),candidate.toString()))
                    .doesNotThrowAnyException();
        }
    }

    @Test void source_builder_preserves_request_experience_fields_without_inventing_a_report_for_null() {
        var raw=fixture.fixture();
        var first=(ObjectNode)raw.at("/input/sessions/0/events/0");
        ((ObjectNode)first.path("action")).put("eventCode","SHOP.SESSION_STARTED");
        first.set("userExperience",fixture.mapper.readTree("{\"instructionUnderstood\":true,\"feedbackNote\":\"이해했다고 기록된 입력\",\"wouldRetry\":false}"));
        var input=fixture.input(raw);
        var details=SourceEventDetails.build(fixture.mapper,input);
        var original=fixture.mapper.valueToTree(input.input()).at("/sessions/0/events/0/userExperience");
        assertThat(details.get(0).path("userExperience")).isEqualTo(original);
        assertThat(details.get(0).path("id").asString()).isEqualTo(input.input().sessions().getFirst().events().getFirst().behaviorLogId().toString());
        first.putNull("userExperience");
        assertThat(SourceEventDetails.build(fixture.mapper,fixture.input(raw)).get(0).has("userExperience")).isFalse();
    }

    @Test void the_pipeline_preserves_originals_and_accepts_only_a_model_repair_followed_by_independent_review() {
        var input=fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("corrected-selection"),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(fixture.mapper,input);
        var prompts=new AiBehaviorAnalysisPromptFactory(fixture.mapper);
        String source=AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,prompts,input,List.of(),refs,false),null,refs);
        var bad=candidate(CLAIM); var good=candidate("목표 위치를 인지했는지는 확인할 수 없습니다.");
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(bad.toString(),"mock"),new GroqChatClient.GroqChatResult(good.toString(),"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(rejection(PATH,CLAIM),"mock"),
                        new GroqChatClient.GroqChatResult(approval(PATH,"UNCERTAIN_OR_PROPOSED",null),"mock"));
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline=new TimelineAnalysisPipeline(prompts,validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(true);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        AiBehaviorAnalysis result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source,2400,24000,audit,parse,false,3);
        assertThat(result.findings().getFirst().interpretation()).isEqualTo("목표 위치를 인지했는지는 확인할 수 없습니다.");
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("SUCCESS");
        assertThat(audit).hasSize(4);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.get(1).validationFailure().code()).isEqualTo("REVIEW_PLAN_SEMANTIC_MISMATCH");
        assertThat(audit.get(2).inputPrompt()).startsWith(source).contains("UNCONFIRMED_COGNITION");
        ((ObjectNode)good.at("/analysis/findings/0/interpretation/0")).set("text",bad.at("/analysis/findings/0/interpretation/0/text"));
        assertThat(good).isEqualTo(bad);
    }

    @Test void actual_seoyeon_valid_review_is_rejected_without_cognition_checks_and_preserves_the_full_source_budget() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(OWN.resolve("ready-e7d00058-original.json")));
        var actual=fixture.mapper.readTree(Files.readString(OWN.resolve("ready-e7d00058-original.json")));
        var attempts=actual.path("attempts"); if(attempts.isString()) attempts=fixture.mapper.readTree(attempts.asString());
        String candidate=attempts.get(14).path("rawOutput").asString();
        String oldReview=attempts.get(15).path("rawOutput").asString();
        String source=attempts.get(12).path("inputPrompt").asString();
        String path="/findings/1/interpretation/0/text";
        assertThat(fixture.mapper.readTree(candidate).at("/analysis"+path).asString()).isEqualTo(CLAIM);
        assertThat(CognitionReviewClaims.locate(fixture.mapper,candidate).keySet()).containsExactly(path);
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,oldReview,candidate,source))
                .hasMessage("REVIEW_COGNITION_CHECK_REQUIRED");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,approval(path,"UNCERTAIN_OR_PROPOSED",null),candidate,source))
                .hasMessage("REVIEW_UNCONFIRMED_COGNITION");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(fixture.mapper,rejection(path,CLAIM),candidate,source))
                .isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        String prompt=AnalysisPlanSemanticReview.prompt(fixture.mapper,source,candidate);
        var newPrompt=fixture.mapper.readTree(prompt);
        var priorPrompt=fixture.mapper.readTree(attempts.get(15).path("inputPrompt").asString());
        assertThat(newPrompt.path("candidate")).isEqualTo(fixture.mapper.readTree(candidate).path("analysis"));
        assertThat(newPrompt.path("sourceFacts")).isEqualTo(priorPrompt.path("sourceFacts"));
        assertThat(newPrompt.path("cognitionClaimPaths")).isEqualTo(fixture.mapper.valueToTree(List.of(path)));
        int semantic=new AnalysisTokenBudget().total(AnalysisPlanSemanticReview.system(),prompt,AnalysisPlanSemanticReview.OUTPUT_TOKENS)+512;
        int primary=new AnalysisTokenBudget().total(AnalysisReviewPrompt.system(),source,1000)+512;
        assertThat(semantic).isLessThanOrEqualTo(24000); assertThat(primary).isLessThanOrEqualTo(24000);
        assertThat(AnalysisPlanSemanticReview.OUTPUT_TOKENS).isLessThanOrEqualTo(1000);
        var report=fixture.mapper.createObjectNode().put("actualModelCalls",0).put("newPlays",0)
                .put("originalAnalysisId",actual.path("id").asString()).put("oldApprovalRejected",true)
                .put("candidateAndOriginalSourceFactsUnchanged",true).put("semanticRequestWith800OutputAnd512Buffer",semantic)
                .put("primaryRequestWith1000OutputAnd512Buffer",primary).put("actualModelRepairVerified",false);
        report.set("mandatoryCognitionClaimPaths",newPrompt.path("cognitionClaimPaths"));
        Files.writeString(OWN.resolve("cognition-claim-boundary-verification.json"),fixture.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }

    private ObjectNode candidate(String text) {
        var candidate=new AnalysisReviewConsistencyTest().envelope("corrected-selection");
        ((ObjectNode)candidate.at("/analysis/findings/0/interpretation/0")).put("text",text);
        return candidate;
    }
    private String approval(String path,String status,String sourcePath) {
        var review=(ObjectNode)fixture.mapper.readTree(valid);
        var check=review.putArray("cognitionChecks").addObject().put("path",path).put("status",status);
        if(sourcePath==null)check.putNull("sourcePath"); else check.put("sourcePath",sourcePath);
        return review.toString();
    }
    private String rejection(String path,String quote) {
        var review=(ObjectNode)fixture.mapper.readTree(approval(path,"UNSUPPORTED_ASSERTION",null));
        review.put("verdict","REPAIR");
        ((tools.jackson.databind.node.ArrayNode)review.path("issues")).addObject().put("code","UNCONFIRMED_COGNITION")
                .put("path",path).put("quote",quote).put("explanation","이동·근접 원본은 위치 인지를 확인하지 않습니다.");
        return review.toString();
    }
}
