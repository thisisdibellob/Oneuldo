package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class GroupedCapabilityBudgetTest {
 @Test void everyApplicationDescriptorAndPolicySurvivesGrouping() {
  var m=JsonMapper.builder().findAndAddModules().build();var old=SourceBoundReviewChecks.capabilities(m);var packed=SourceBoundReviewChecks.promptCapabilities(m);var fields=m.createObjectNode();
  for(var group:packed.path("fieldGroups"))for(var path:group.path("paths"))fields.set(path.asString(),group.path("descriptor"));
  assertThat(fields).isEqualTo(old.path("fields"));assertThat(packed.path("policy")).isEqualTo(old.path("policy"));
 }
 @Test void actualFailedFinalInputFitsWithoutRemovingOriginalFacts() throws Exception {
  var path=java.nio.file.Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/grounded-profile-nine-20261024/results/candidate/adult-minjae-unit-support-research-v2-3-baseline-post/attempts.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(path));
  var m=JsonMapper.builder().findAndAddModules().build();var codec=new FinalSourceEncoding(m);var attempts=m.readTree(java.nio.file.Files.readString(path));
  var source=codec.decode(m.readTree(attempts.get(attempts.size()-1).path("inputPrompt").asString()));var before=source.deepCopy();
  source.set("implementedSupportCapabilities",SourceBoundReviewChecks.promptCapabilities(m));
  var packed=codec.encodeReadable(source);var restored=codec.decode(packed);
  before.remove("implementedSupportCapabilities");restored.remove("implementedSupportCapabilities");assertThat(restored).isEqualTo(before);
  var budget=new AnalysisTokenBudget();org.springframework.test.util.ReflectionTestUtils.setField(budget,"requestTokens",32000);org.springframework.test.util.ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var manifest=m.readTree(java.nio.file.Files.readString(path.getParent().getParent().getParent().getParent().resolve("manifest.json")));
  var raw=m.readTree(java.nio.file.Files.readString(java.nio.file.Path.of(manifest.path("cases").get(2).path("sourcePath").asString())));
  var input=m.treeToValue(raw,oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);var response=new oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
  var refs=new AnalysisReferences(m,response);String plainReview=AnalysisReviewPrompt.build(m,packed.toString(),null,refs);
  var reviewFacts=codec.decode(m.readTree(plainReview));
  assertThat(reviewFacts.path(SourceEventDetails.FIELD)).isEqualTo(source.path(SourceEventDetails.FIELD));
  assertThat(reviewFacts.path("taskContext")).isEqualTo(source.path("taskContext"));
  String review=AnalysisReviewWire.prompt(m,plainReview);
  int required=budget.total(AnalysisReviewPrompt.system(),review+(String)org.springframework.test.util.ReflectionTestUtils.getField(TimelineAnalysisPipeline.class,"RETRY"),3200)+256;
  java.nio.file.Files.writeString(path.getParent().getParent().getParent().getParent().resolve("grouped-capability-budget.json"),m.writeValueAsString(java.util.Map.of("requiredTokens",required,"allOriginalFactsPreserved",true)));
  assertThat(required).isLessThanOrEqualTo(32000);
 }
}
