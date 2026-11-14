package oneuldo.behaviorlog.analysis;

import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SummaryBackedPlanTest {
 private final MovementProjectionTest fixture=new MovementProjectionTest();
 private ObjectNode candidate(){
  var e=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
  ((ObjectNode)e.path("analysis")).putArray("findings");
  ((ObjectNode)e.at("/analysis/practicePlan")).putArray("targetFindingIds");
  ((ObjectNode)e.at("/analysis/practicePlan/rationale")).putArray("observed").addObject().put("findingId","$summary").put("observationIndex",0);
  return e;
 }
 private AnalysisReferences refs(){return new AnalysisReferences(fixture.mapper,fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class));}
 private String read(ObjectNode e){return AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,e.toString(),refs());}
 @Test void empty_findings_can_reference_an_existing_cited_summary_without_manufacturing_a_finding(){
  var e=candidate();String original=e.toString();var out=fixture.mapper.readTree(read(e));
  assertThat(out.path("findings")).isEmpty();
  assertThat(out.at("/practicePlan/rationale").asString()).contains("관찰: "+e.at("/analysis/summary/0/text").asString());
  assertThat(e.toString()).isEqualTo(original);
 }
 @Test void nonexistent_duplicate_out_of_range_or_summary_with_existing_findings_still_fails(){
  for(String id:List.of("F1","none")){var e=candidate();((ObjectNode)e.at("/analysis/practicePlan/rationale/observed/0")).put("findingId",id);assertThatThrownBy(()->read(e)).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");}
  var e=candidate();((ObjectNode)e.at("/analysis/practicePlan/rationale/observed/0")).put("observationIndex",99);assertThatThrownBy(()->read(e)).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");
  var duplicate=candidate();((ArrayNode)duplicate.at("/analysis/practicePlan/rationale/observed")).add(duplicate.at("/analysis/practicePlan/rationale/observed/0").deepCopy());assertThatThrownBy(()->read(duplicate)).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");
  var present=new AnalysisReviewConsistencyTest().envelope("wrong-specification");((ObjectNode)present.at("/analysis/practicePlan/rationale/observed/0")).put("findingId","$summary");assertThatThrownBy(()->read(present)).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");
 }
 @Test void source_citation_and_task_judgment_guards_are_not_bypassed_by_summary_basis(){
  var invented=candidate();((ObjectNode)invented.at("/analysis/summary/0")).putArray("evidenceEventIds").add("E999");assertThatThrownBy(()->read(invented)).hasMessage("UNKNOWN_REVIEW_EVIDENCE");
  var contradiction=candidate();((ObjectNode)contradiction.at("/analysis/sessionAssessments/0")).put("judgment","SUCCESS");assertThatThrownBy(()->read(contradiction)).hasMessage("REVIEW_TASK_JUDGMENT_CONTRADICTION");
 }
 @Test void five_actual_rejected_drafts_receive_exact_prior_response_and_existing_summary_indexes() throws Exception {
  var raw=fixture.mapper.readTree(java.nio.file.Files.readString(java.nio.file.Path.of("../output/persona45-speed-20261014/v72-actual-plan-reference-failures.json")));assertThat(raw.size()).isEqualTo(5);
  for(var value:raw){String text=value.asString();var candidate=fixture.mapper.readTree(text);assertThat(candidate.at("/analysis/findings")).isEmpty();String feedback=ReviewPlanReferenceFeedback.build(fixture.mapper,text);var diagnostic=fixture.mapper.readTree(feedback.substring(feedback.indexOf('{')));assertThat(diagnostic.path("previousRejectedResponse").asString()).isEqualTo(text);var choices=diagnostic.path("availableObservedReferences");assertThat(choices.size()).isEqualTo(candidate.at("/analysis/summary").size());for(int i=0;i<choices.size();i++){assertThat(choices.get(i).path("findingId").asString()).isEqualTo("$summary");assertThat(choices.get(i).path("observationIndex").asInt()).isEqualTo(i);}assertThat(candidate.toString()).isEqualTo(fixture.mapper.readTree(text).toString());}
 }
 @Test void retry_keeps_the_full_original_source_and_reruns_the_complete_parser(){
  var bad=candidate();((ObjectNode)bad.at("/analysis/practicePlan/rationale/observed/0")).put("findingId","none");String raw=bad.toString(),good=candidate().toString();
  var client=mock(GroqChatClient.class);when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(raw,"mock"),new GroqChatClient.GroqChatResult(good,"mock"));
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(false);
  var seen=new ArrayList<String>();Function<String,String> parse=value->{seen.add(value);return read((ObjectNode)fixture.mapper.readTree(value));};
  String result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),"LITERAL_UNCHANGED_FULL_SOURCE",2400,32000,audit,parse,false,3);
  assertThat(result).isNotBlank();assertThat(seen).containsExactly(raw,good);assertThat(audit).hasSize(2);assertThat(audit.get(0).rawOutput()).isEqualTo(raw);assertThat(audit.get(1).inputPrompt()).startsWith("LITERAL_UNCHANGED_FULL_SOURCE").contains("previousRejectedResponse","availableObservedReferences","$summary");
 }
}
