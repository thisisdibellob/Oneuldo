package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ColdAnalysisTransportProbeTest {
 @Test void compare_exact_observation_transports_on_saved_cold_inputs() throws Exception {
  var m=JsonMapper.builder().build();var file=Path.of("../output/analysis-speed-quality-20261013/attempt-01-cold/cold-attempts.json");Assumptions.assumeTrue(Files.exists(file));
  var out=Path.of("../output/cold-analysis-fix-20261014");Files.createDirectories(out);var report=m.createArrayNode();
  for(var attempt:m.readTree(Files.readString(file))) {
   String text=attempt.path("inputPrompt").asString();if(!text.contains("behaviorTimeline"))continue;
   var source=(ObjectNode)new LosslessTables(m).decode(m.readTree(text.substring(0,text.lastIndexOf('}')+1)));
   var row=report.addObject().put("part",attempt.path("number").asInt()).put("oldTokens",QwenTokenCounter.count(text));
   var fields=row.putObject("fields");for(String key:source.propertyNames())fields.put(key,QwenTokenCounter.count(source.get(key).toString()));
   var codec=new FinalSourceEncoding(m,true);var packed=codec.encode(source);assertThat(codec.decode(packed)).isEqualTo(source);
   row.put("finalColumnsTokens",QwenTokenCounter.count(packed.toString()));
   var numeric=new oneuldo.behaviorlog.personalization.service.AdaptiveNumericColumnText(m).encode(packed);
   row.put("numericTextTokens",QwenTokenCounter.count(numeric.toString()));
   for(boolean suffix:List.of(false,true)) {
    var fragments=new oneuldo.behaviorlog.personalization.service.AdaptiveNumericFragments(m,suffix).encode(packed);
    var both=new oneuldo.behaviorlog.personalization.service.AdaptiveNumericColumnText(m).encode(fragments);
    row.put(suffix?"prefixSuffixTokens":"prefixTokens",QwenTokenCounter.count(both.toString()));
    var restored=both;
    if(restored.has(oneuldo.behaviorlog.personalization.service.AdaptiveNumericColumnText.RULE_FIELD))restored=oneuldo.behaviorlog.personalization.service.AdaptiveNumericColumnText.decode(m,restored);
    if(restored.has(oneuldo.behaviorlog.personalization.service.AdaptiveNumericFragments.RULE_FIELD))restored=oneuldo.behaviorlog.personalization.service.AdaptiveNumericFragments.decode(m,restored);
    assertThat(codec.decode(restored)).isEqualTo(source);
   }
   if(attempt.path("number").asInt()==1) {
    Files.writeString(out.resolve("observation-first-original.json"),m.writeValueAsString(source));
    Files.writeString(out.resolve("observation-first-candidate.json"),m.writeValueAsString(packed));
   }
  }
  Files.writeString(out.resolve("transport-probe.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report));
 }
}
