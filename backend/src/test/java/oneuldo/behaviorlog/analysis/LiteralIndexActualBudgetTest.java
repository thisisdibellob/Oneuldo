package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class LiteralIndexActualBudgetTest {
 @Test void completed_baseline_review_sources_still_fit_with_literal_order_and_ownership() throws Exception {
  Path root=Path.of("../output/analysis-nine-cold-20261016");assumeTrue(Files.isDirectory(root.resolve("results/baseline")));
  var mapper=JsonMapper.builder().findAndAddModules().build();var report=mapper.createArrayNode();
  try(var paths=Files.list(root.resolve("results/baseline"))) {
   for(var folder:paths.toList()) {
    var file=folder.resolve("model-calls.json");if(!Files.exists(file))continue;
    for(var call:mapper.readTree(Files.readString(file))) {
     if(!call.path("schema").path("properties").has("reviewFormat"))continue;
     String updated=AnalysisReviewWire.prompt(mapper,call.path("inputPrompt").asString());
     int required=QwenTokenCounter.inputTokens(AnalysisReviewPrompt.system(),updated)+3200+512;
     report.addObject().put("case",folder.getFileName().toString()).put("call",call.path("number").asInt()).put("requiredTokens",required);
     assertThat(required).as(folder.getFileName().toString()).isLessThanOrEqualTo(32000);
    }
   }
  }
  assumeTrue(!report.isEmpty());
  Files.writeString(root.resolve("literal-index-actual-budgets.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
 }
}
