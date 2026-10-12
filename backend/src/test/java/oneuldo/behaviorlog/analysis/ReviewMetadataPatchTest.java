package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.ReviewMetadataPatch;
import static org.assertj.core.api.Assertions.*;
class ReviewMetadataPatchTest {
 final JsonMapper mapper=JsonMapper.builder().build();
 @Test void model_patch_changes_only_reported_metadata_and_preserves_every_judgment_and_source_claim(){
  String candidate="{\"analysis\":{\"summary\":[{\"text\":\"원본 주장\",\"evidenceEventIds\":[\"E1\"]}],\"sessionAssessments\":[{\"judgment\":\"FAILURE\"}],\"practicePlan\":{\"recommendedDifficulty\":2,\"rationale\":{\"baselineDifficulty\":2,\"unknownCauseIndexes\":[0]}}},\"reviewNotes\":[\"원문 유지\"]}";
  var original=mapper.readTree(candidate);var result=mapper.readTree(ReviewMetadataPatch.apply(mapper,candidate,"{\"patches\":[{\"path\":\"/analysis/practicePlan/rationale/baselineDifficulty\",\"value\":null}]}"));
  assertThat(result.at(ReviewMetadataPatch.PATH).isNull()).isTrue();var restored=result.deepCopy();((tools.jackson.databind.node.ObjectNode)restored.at("/analysis/practicePlan/rationale")).put("baselineDifficulty",2);assertThat(restored).isEqualTo(original);
 }
 @Test void extra_paths_and_rewritten_analysis_are_not_accepted(){
  for(String response:new String[]{"{\"analysis\":{}}","{\"patches\":[{\"path\":\"/analysis/sessionAssessments\",\"value\":null}]}","{\"patches\":[{\"path\":\"/analysis/practicePlan/rationale/baselineDifficulty\",\"value\":null},{\"path\":\"/analysis/summary\",\"value\":[]}]}","{\"patches\":[{\"path\":\"/analysis/practicePlan/rationale/baselineDifficulty\",\"value\":\"GUIDED_PRACTICE\"}]}"})
   assertThatThrownBy(()->ReviewMetadataPatch.apply(mapper,"{}",response)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void actual_failed_review_can_be_resubmitted_with_every_source_and_candidate_under_budget() throws Exception {
  var file=java.nio.file.Path.of("../output/persona45-mcp-20261013/auditor/analyses.json");org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(file));int checked=0;
  var report=mapper.createArrayNode();
  for(var run:mapper.readTree(java.nio.file.Files.readString(file)))for(var attempt:run.path("attempts")){
   if(!"REVIEW_UNRECORDED_DIFFICULTY_BASELINE".equals(attempt.path("validationFailure").path("code").asString()))continue;
   String prompt=attempt.path("inputPrompt").asString()+"\nCandidate (all values retained): "+attempt.path("rawOutput").asString()+"\nReported technical error: "+attempt.path("validationFailure");
   int required=oneuldo.behaviorlog.analysis.service.QwenTokenCounter.inputTokens(ReviewMetadataPatch.SYSTEM,prompt)+ReviewMetadataPatch.OUTPUT_TOKENS+32;
   report.addObject().put("analysisId",run.path("id").asString()).put("requiredTokens",required).put("fullSourceAndCandidateRetained",true);assertThat(required).isLessThanOrEqualTo(24000);checked++;
  }
  org.junit.jupiter.api.Assumptions.assumeTrue(checked>0);
  java.nio.file.Files.writeString(java.nio.file.Path.of("../output/persona45-mcp-20261013/review-metadata-patch-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
 }
}
