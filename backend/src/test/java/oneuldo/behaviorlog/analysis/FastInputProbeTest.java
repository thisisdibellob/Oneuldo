package oneuldo.behaviorlog.analysis;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
@EnabledIfEnvironmentVariable(named="FAST_ANALYSIS_PROBE",matches="true")
class FastInputProbeTest {
 @Test void measure() throws Exception {
  var m=JsonMapper.builder().findAndAddModules().build();var input=m.readValue(Files.readString(Path.of("../output/other-play-analysis-2026-09-13/input.json")),BehaviorAnalysisInputResponse.class);
  var raw=(tools.jackson.databind.node.ObjectNode)m.valueToTree(input.input());var codec=new GroupedEventInput(m);org.assertj.core.api.Assertions.assertThat(codec.decode(codec.encode(raw))).isEqualTo(raw);
  var f=new AiBehaviorAnalysisPromptFactory(m);var refs=new AnalysisReferences(m,input);
  var wire=refs.encode(f.wholeSourcePrompt(input));
  System.out.println("WHOLE_RESERVED "+(QwenTokenCounter.inputTokens(f.wholeSourceSystem(),wire)+1800+200));
  var budget=new AnalysisTokenBudget();org.springframework.test.util.ReflectionTestUtils.setField(budget,"requestTokens",7800);org.springframework.test.util.ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);org.springframework.test.util.ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
  var pipeline=new TimelineAnalysisPipeline(f,null,null,m,64,budget,new AnalysisCallPacer());
  var chunks=pipeline.partition(input,7800);System.out.println("CHUNKS "+chunks.stream().map(BehaviorAnalysisInputResponse::eventCount).toList());
  var r=m.readTree(wire);System.out.println("TOTAL "+QwenTokenCounter.count(wire));for(String k:r.propertyNames())System.out.println(k+" "+QwenTokenCounter.count(r.get(k).toString()));
  Files.createDirectories(Path.of("../output/fast-input-test"));Files.writeString(Path.of("../output/fast-input-test/input.json"),wire);
 }
}
