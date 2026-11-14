package oneuldo.behaviorlog.analysis;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class ReviewObservationOrderPatchTest {
 final JsonMapper m=JsonMapper.builder().build();
 final ReviewEvidenceException.Details issue=new ReviewEvidenceException.Details("REVIEW_EVIDENCE_OUT_OF_ORDER","/findings/0/observation/1",List.of("E9","E2"));
 String candidate="""
 {"taskChecks":["unchanged"],"analysis":{"findings":[{"id":"F1","skill":"cart","observation":[{"text":"final empty","evidenceEventIds":["E1","E9"]},{"text":"opened four times","evidenceEventIds":["E2","E3"]}],"interpretation":[],"alternativeExplanations":[],"suggestedSupport":"unchanged"}],"summary":["unchanged"],"sessionAssessments":["unchanged"],"practicePlan":{"goal":"unchanged","rationale":{"observed":[{"findingId":"F1","observationIndex":0},{"findingId":"F1","observationIndex":1},{"findingId":"F2","observationIndex":0}]}}}}
 """;
 @Test void preservesEveryClauseAndRemapsPlanToSameOriginalObservations(){
  var before=m.readTree(candidate);var after=m.readTree(ReviewObservationOrderPatch.apply(m,candidate,issue,"{\"order\":[1,0]}"));
  var oldRows=before.at("/analysis/findings/0/observation");var newRows=after.at("/analysis/findings/0/observation");
  assertThat(newRows.get(0)).isEqualTo(oldRows.get(1));assertThat(newRows.get(1)).isEqualTo(oldRows.get(0));
  assertThat(after.at("/analysis/practicePlan/rationale/observed/0/observationIndex").asInt()).isEqualTo(1);
  assertThat(after.at("/analysis/practicePlan/rationale/observed/1/observationIndex").asInt()).isZero();
  assertThat(after.at("/analysis/practicePlan/rationale/observed/2")).isEqualTo(before.at("/analysis/practicePlan/rationale/observed/2"));
  assertThat(after.path("taskChecks")).isEqualTo(before.path("taskChecks"));
  assertThat(after.at("/analysis/sessionAssessments")).isEqualTo(before.at("/analysis/sessionAssessments"));
  assertThat(ReviewObservationOrderPatch.prompt(m,"FULL_RAW_SOURCE",candidate,issue)).contains("FULL_RAW_SOURCE",candidate);
 }
 @Test void rejectsMissingDuplicatedForeignOrRewrittenObservations(){
  for(String p:List.of("{\"order\":[0]}","{\"order\":[0,0]}","{\"order\":[2,0]}","{\"order\":[1,0],\"text\":\"new\"}","{\"order\":[1,0]} {}"))
   assertThatThrownBy(()->ReviewObservationOrderPatch.apply(m,candidate,issue,p)).isInstanceOf(RuntimeException.class);
  assertThat(ReviewObservationOrderPatch.canRepair(m,candidate,new ReviewEvidenceException.Details("UNKNOWN","/findings/0/observation/1",List.of()))).isFalse();
 }
 @Test void pipelineRoutesOrderRepairAndRechecksWithoutBypassingParser(){
  var client=org.mockito.Mockito.mock(oneuldo.ai.client.GroqChatClient.class);
  org.mockito.Mockito.when(client.complete(org.mockito.ArgumentMatchers.eq(ReviewObservationOrderPatch.SYSTEM),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyInt(),org.mockito.ArgumentMatchers.eq(0.0)))
   .thenReturn(new oneuldo.ai.client.GroqChatClient.GroqChatResult("{\"order\":[1,0]}","mock"));
  var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator()),client,m).withQualityReview(true).withPlanSemanticReview(false);
  var audit=new ArrayList<oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun.Attempt>();
  java.util.function.Function<String,String> parse=raw->{assertThat(m.readTree(raw).at("/analysis/findings/0/observation/0/text").asString()).isEqualTo("opened four times");return "validated";};
  String result=org.springframework.test.util.ReflectionTestUtils.invokeMethod(pipeline,"repairReviewMetadata","FULL_RAW",candidate,issue,32000,audit,parse);
  assertThat(result).isEqualTo("validated");assertThat(audit).hasSize(1);assertThat(audit.getFirst().inputPrompt()).startsWith("FULL_RAW").contains(candidate);
  java.util.function.Function<String,String> reject=raw->{throw new IllegalArgumentException("SOURCE_REJECTED");};
  assertThatThrownBy(()->org.springframework.test.util.ReflectionTestUtils.invokeMethod(pipeline,"repairReviewMetadata","FULL_RAW",candidate,issue,32000,new ArrayList<>(),reject)).hasMessage("SOURCE_REJECTED");
 }
}
