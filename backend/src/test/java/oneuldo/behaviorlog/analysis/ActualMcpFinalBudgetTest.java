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
   var original=codec.decode(mapper.readTree(attempt.path("inputPrompt").asString()));var packed=codec.encodeReadable(original);var restored=codec.decode(packed);
   assertThat(restored).isEqualTo(original);
   assertThat(packed.path("readableSourceFacts").path("eventsById")).isEqualTo(original.path("readableSourceFacts").path("eventsById"));
   int required=QwenTokenCounter.inputTokens(attempt.path("systemPrompt").asString(),packed.toString())+3200+512;
   var item=report.addObject().put("analysisId",run.path("id").asString()).put("requiredTokens",required).put("allOriginalFactsPreserved",true);
   item.put("systemTokens",QwenTokenCounter.count(attempt.path("systemPrompt").asString()));var sizes=item.putObject("encodedFieldTokens");for(String field:packed.propertyNames())sizes.put(field,QwenTokenCounter.count(packed.get(field).toString()));
   Files.writeString(Path.of("../output/persona45-mcp-20261013/final-source-count-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
   assertThat(required).isLessThanOrEqualTo(24000);found++;
  }
  Assumptions.assumeTrue(found>0);
  Files.writeString(Path.of("../output/persona45-mcp-20261013/final-source-count-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
 }
}
