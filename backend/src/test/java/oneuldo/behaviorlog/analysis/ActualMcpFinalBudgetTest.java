package oneuldo.behaviorlog.analysis;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.*;
import static org.assertj.core.api.Assertions.*;
class ActualMcpFinalBudgetTest {
 @Test void full_actual_mcp_final_source_fits_after_exact_count_table_encoding() throws Exception {
  var file=Path.of("../output/persona45-mcp-20261013/auditor/analyses.json");Assumptions.assumeTrue(Files.exists(file));
  var mapper=JsonMapper.builder().findAndAddModules().build();var codec=new FinalSourceEncoding(mapper);var report=mapper.createArrayNode();int found=0;
  for(var run:mapper.readTree(Files.readString(file)))for(var attempt:run.path("attempts")){
   if(!"FINAL_EVIDENCE_EXCEEDS_LIMIT".equals(attempt.path("errorCode").asString()))continue;
   var original=codec.decode(mapper.readTree(attempt.path("inputPrompt").asString()));var source=original.deepCopy();
   source.remove(java.util.List.of("sourceEventDetailsRule","eventSemantics","eventDefinitions","interpretationRule","practiceCapabilities"));
   source.put("categoryMeaning","produce=과일/채소, fresh=냉장 식품, drink=음료, meal=간편 식품. 원래 categoryId로 위치를 확인한다.");source.put("outputContract",AnalysisSynthesisPrompt.COMPACT_CONTRACT);
   var packed=codec.encodeReadable(source);var restored=codec.decode(packed);
   var oldFacts=original.deepCopy();var newFacts=restored.deepCopy();
   for(var value:java.util.List.of(oldFacts,newFacts))value.remove(java.util.List.of("sourceEventDetailsRule","eventSemantics","eventDefinitions","interpretationRule","practiceCapabilities","categoryMeaning","outputContract"));
   assertThat(newFacts).isEqualTo(oldFacts);
   assertThat(packed.path("readableSourceFacts").path("eventsById")).isEqualTo(original.path("readableSourceFacts").path("eventsById"));
   int required=QwenTokenCounter.inputTokens(FinalAnalysisPromptCompactor.systemPrompt(),packed.toString())+3200+512;
   var item=report.addObject().put("analysisId",run.path("id").asString()).put("requiredTokens",required).put("allOriginalFactsPreserved",true);
   item.put("systemTokens",QwenTokenCounter.count(attempt.path("systemPrompt").asString()));var sizes=item.putObject("encodedFieldTokens");for(String field:packed.propertyNames())sizes.put(field,QwenTokenCounter.count(packed.get(field).toString()));
   Files.writeString(Path.of("../output/persona45-mcp-20261013/final-source-count-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
   assertThat(required).isLessThanOrEqualTo(24000);found++;
   var snapshotRows=mapper.readTree(Files.readString(Path.of("../output/persona45-mcp-20261013/auditor/input-snapshots.json")));
   for(var row:snapshotRows)if(row.path("id").asString().equals(run.path("dataset_id").asString())){
    var input=mapper.treeToValue(row.path("input_data"),oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);
    var response=new oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
    var refs=new AnalysisReferences(mapper,response);String review=AnalysisReviewPrompt.build(mapper,packed.toString(),null,refs);
    var decodedReview=codec.decode(mapper.readTree(review));var stations=decodedReview.path("stationClaimSources");
    assertThat(stations).hasSize(refs.recordedStations().size());
    for(var station:stations){var recorded=refs.recordedStations().get(station.path("eventId").asString());assertThat(station.path("stationId")).isEqualTo(recorded.path("stationId"));assertThat(station.path("kind")).isEqualTo(recorded.path("kind"));}
    int reviewRequired=QwenTokenCounter.inputTokens(AnalysisReviewPrompt.system(),review)+3200+512;item.put("reviewRequiredTokens",reviewRequired);
    item.put("reviewSystemTokens",QwenTokenCounter.count(AnalysisReviewPrompt.system()));var reviewSizes=item.putObject("reviewFieldTokens");var wire=mapper.readTree(review);for(String field:wire.propertyNames())reviewSizes.put(field,QwenTokenCounter.count(wire.get(field).toString()));
    Files.writeString(Path.of("../output/persona45-mcp-20261013/final-source-count-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    assertThat(reviewRequired).isLessThanOrEqualTo(24000);
   }
  }
  Assumptions.assumeTrue(found>0);
  Files.writeString(Path.of("../output/persona45-mcp-20261013/final-source-count-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
 }
}
