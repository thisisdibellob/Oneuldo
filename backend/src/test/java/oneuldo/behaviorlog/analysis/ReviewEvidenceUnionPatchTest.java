package oneuldo.behaviorlog.analysis;
import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReviewEvidenceUnionPatchTest {
 private final ObjectMapper mapper=new MovementProjectionTest().mapper;
 private final ReviewEvidenceException.Details issue=new ReviewEvidenceException.Details("ANALYSIS_FINDING_EVIDENCE_COUNT_EXCEEDS_LIMIT","/analysis/findings/0",List.of());
 private ObjectNode candidate(){
  var r=new AnalysisReviewConsistencyTest().envelope("wrong-specification");var f=(ObjectNode)r.at(issue.path());
  for(String field:List.of("observation","interpretation","alternativeExplanations")){
   var rows=f.putArray(field);var row=rows.addObject().put("text","원본의 상품 선택 기록을 관찰했으며 원인은 미확인입니다.");var ids=row.putArray("evidenceEventIds");
   if(field.equals("observation"))for(int i=1;i<=30;i++)ids.add("E"+i);else if(field.equals("interpretation"))ids.add("E31");else ids.add("E32");
  }return r;
 }
 private String patch(ObjectNode candidate){
  var f=candidate.at(issue.path()).deepCopy();var ids=((ObjectNode)f.path("observation").get(0)).putArray("evidenceEventIds");ids.add("E1");
  var r=mapper.createObjectNode();r.putArray("patches").addObject().put("path",issue.path()).set("value",f);return r.toString();
 }
 @Test void complete_sources_and_exact_union_diagnostic_are_present_without_choosing_replacements(){
  var c=candidate();var original=c.deepCopy();String p=ReviewEvidenceUnionPatch.prompt(mapper,"LITERAL_ORIGINAL_SOURCE",c.toString(),issue);
  assertThat(p).startsWith("LITERAL_ORIGINAL_SOURCE").contains(c.toString(),"\"distinctEvidenceCount\":32","E32");
  assertThat(c).isEqualTo(original);assertThat(ReviewEvidenceUnionPatch.outputTokens(mapper,c.toString(),issue)).isGreaterThan(512);
 }
 @Test void model_finding_patch_preserves_other_values_and_all_plan_observation_indexes(){
  var c=candidate();var result=mapper.readTree(ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,patch(c)));
  assertThat(result.at("/analysis/sessionAssessments")).isEqualTo(c.at("/analysis/sessionAssessments"));
  assertThat(result.at("/analysis/practicePlan")).isEqualTo(c.at("/analysis/practicePlan"));
  ((ArrayNode)result.at("/analysis/findings")).set(0,c.at(issue.path()).deepCopy());assertThat(result).isEqualTo(c);
 }
 @Test void shared_pool_decodes_model_choices_exactly_and_rejects_invalid_indices_or_pool_size(){
  var c=candidate();var raw=(ObjectNode)mapper.readTree(patch(c));var pool=raw.putArray("citationPool");pool.add("E1");pool.add("E31");pool.add("E32");
  int index=0;for(String field:List.of("observation","interpretation","alternativeExplanations")){
   var clause=(ObjectNode)raw.at("/patches/0/value/"+field+"/0");clause.remove("evidenceEventIds");clause.putArray("evidenceIndexes").add(index++);
  }
  assertThat(ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,raw.toString())).isEqualTo(ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,patch(c)));
  var schema=mapper.valueToTree(ReviewEvidenceUnionPatch.schema(mapper,c.toString(),issue));
  assertThat(schema.at("/properties/citationPool/maxItems").asInt()).isEqualTo(30);
  assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isTrue();
  var wider=schema.deepCopy();((ObjectNode)wider.at("/properties/citationPool")).put("maxItems",31);
  assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(wider)).isFalse();
  var invalid=raw.deepCopy();((ObjectNode)invalid.at("/patches/0/value/observation/0")).putArray("evidenceIndexes").add(3);
  assertThatThrownBy(()->ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,invalid.toString())).hasMessage("INVALID_REVIEW_EVIDENCE_UNION_PATCH");
  for(int i=33;i<62;i++)pool.add("E"+i);
  assertThatThrownBy(()->ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,raw.toString())).hasMessage("INVALID_REVIEW_EVIDENCE_UNION_PATCH");
 }
 @Test void overflow_wrong_paths_new_citations_and_changed_identity_are_rejected(){
  var c=candidate();String good=patch(c);
  var tooMany=mapper.createObjectNode();tooMany.putArray("patches").addObject().put("path",issue.path()).set("value",c.at(issue.path()));
  for(String bad:List.of(tooMany.toString(),good.replace("E31","E999"),good.replace("\"F1\"","\"F9\""),good.replace(issue.path(),"/analysis/sessionAssessments/0"),good+" {}"))
   assertThatThrownBy(()->ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,bad)).isInstanceOf(RuntimeException.class);
  var changed=(ObjectNode)mapper.readTree(good);((ObjectNode)changed.at("/patches/0/value")).putArray("observation");
  assertThatThrownBy(()->ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,changed.toString())).hasMessage("INVALID_REVIEW_EVIDENCE_UNION_PATCH");
 }
 @Test void only_an_actual_overflowing_finding_is_eligible(){
  var c=candidate();assertThat(ReviewEvidenceUnionPatch.canRepair(mapper,c.toString(),issue)).isTrue();
  String fixed=ReviewEvidenceUnionPatch.apply(mapper,c.toString(),issue,patch(c));assertThat(ReviewEvidenceUnionPatch.canRepair(mapper,fixed,issue)).isFalse();
  assertThat(ReviewEvidenceUnionPatch.canRepair(mapper,c.toString(),new ReviewEvidenceException.Details("UNKNOWN_REVIEW_EVIDENCE",issue.path(),List.of()))).isFalse();
 }
 @Test void pipeline_routes_to_one_model_patch_and_rechecks_the_complete_candidate(){
  var c=candidate();var client=mock(GroqChatClient.class);when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(c.toString(),"mock"));
  when(client.complete(eq(ReviewEvidenceUnionPatch.SYSTEM),anyString(),anyInt(),eq(0.0))).thenReturn(new GroqChatClient.GroqChatResult(patch(c),"mock"));
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();var pipeline=pipeline(client);var seen=new ArrayList<String>();
  Function<String,String> parse=raw->{seen.add(raw);if(raw.equals(c.toString()))throw new ReviewEvidenceException(issue.code(),issue.path(),List.of());return "source-validated";};
  String result=ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),"UNCHANGED_FULL_SOURCE",2400,32000,audit,parse,false,3);
  assertThat(result).isEqualTo("source-validated");assertThat(seen).hasSize(2);assertThat(audit).hasSize(2);assertThat(audit.getFirst().rawOutput()).isEqualTo(c.toString());
  assertThat(audit.getLast().source()).isEqualTo("REVIEW_EVIDENCE_UNION_PATCH");assertThat(audit.getLast().inputPrompt()).startsWith("UNCHANGED_FULL_SOURCE").contains(c.toString());
  verify(client,times(1)).complete(eq(AnalysisReviewPrompt.system()),anyString(),anyInt(),anyDouble());
 }
 @Test void successful_patch_application_does_not_bypass_a_source_parser_rejection(){
  var c=candidate();var client=mock(GroqChatClient.class);when(client.complete(eq(ReviewEvidenceUnionPatch.SYSTEM),anyString(),anyInt(),eq(0.0))).thenReturn(new GroqChatClient.GroqChatResult(patch(c),"mock"));
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();Function<String,String> parse=raw->{throw new IllegalArgumentException("SOURCE_CHECK_REJECTED");};
  assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(pipeline(client),"repairReviewEvidenceUnion","UNCHANGED_FULL_SOURCE",c.toString(),issue,32000,audit,parse)).hasMessage("SOURCE_CHECK_REJECTED");
  assertThat(audit).hasSize(1);assertThat(audit.getFirst().errorCode()).isEqualTo("PATCH_RECHECK_REJECTED");
 }
 @Test void retries_report_the_actual_union_and_keep_full_source_and_semantic_checks(){
  var c=candidate();var rejected=mapper.createObjectNode();rejected.putArray("patches").addObject().put("path",issue.path()).set("value",c.at(issue.path()));
  var client=mock(GroqChatClient.class);when(client.complete(eq(ReviewEvidenceUnionPatch.SYSTEM),anyString(),anyInt(),eq(0.0)))
    .thenReturn(new GroqChatClient.GroqChatResult(rejected.toString(),"mock"),new GroqChatClient.GroqChatResult(patch(c),"mock"));
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
  String result=ReflectionTestUtils.invokeMethod(pipeline(client),"repairReviewEvidenceUnion","LITERAL_FULL_SOURCE",c.toString(),issue,32000,audit,(Function<String,String>)(raw->"validated"));
  assertThat(result).isEqualTo("validated");assertThat(audit).hasSize(2);
  assertThat(audit.getLast().inputPrompt()).startsWith("LITERAL_FULL_SOURCE").contains(c.toString(),rejected.toString(),"\"rejectedDistinctEvidenceCount\":32","\"nextAttempt\":2");
  assertThat(audit.getFirst().errorCode()).isEqualTo("INVALID_REVIEW_EVIDENCE_UNION_PATCH");
 }
 @Test void actual_three_identical_failed_outputs_get_exact_global_counts_without_silent_truncation() throws Exception {
  var file=java.nio.file.Path.of("../output/persona45-speed-20261014/v71-actual-rejected-union-patches.json");
  var responses=mapper.readTree(java.nio.file.Files.readString(file));assertThat(responses.size()).isEqualTo(3);
  for(var response:responses){String raw=response.asString();var finding=mapper.readTree(raw).at("/patches/0/value");var ids=new HashSet<String>();
   for(String key:List.of("observation","interpretation","alternativeExplanations"))for(var clause:finding.path(key))for(var id:clause.path("evidenceEventIds"))ids.add(id.asString());
   assertThat(ids.size()).isGreaterThan(30);String feedback=ReviewEvidenceUnionPatch.retryFeedback(mapper,raw,2);
   assertThat(feedback).contains(raw,"\"rejectedDistinctEvidenceCount\":"+ids.size(),"\"findingUnionLimit\":30");
  }
 }
 private TimelineAnalysisPipeline pipeline(GroqChatClient client){return new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,mapper).withQualityReview(true).withPlanSemanticReview(false);}
}
