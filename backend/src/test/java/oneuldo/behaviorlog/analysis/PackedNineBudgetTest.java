package oneuldo.behaviorlog.analysis;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.ai.client.GroqChatClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
@EnabledIfEnvironmentVariable(named="AI_PACKED_NINE_BUDGET",matches="true")
class PackedNineBudgetTest {
 @Test void exactTokenPackedNinePreserveEverySourceEvent() throws Exception {
  var m=JsonMapper.builder().findAndAddModules().build();var root=Path.of("../output/grounded-speed-nine-20261024");
  var manifest=m.readTree(Files.readString(Path.of("../output/rag-nine-20261024/manifest.json")));var reports=m.createArrayNode();
  for(var c:manifest.path("cases")) {
   var input=m.readValue(Files.readString(Path.of(c.path("sourcePath").asString())),BehaviorAnalysisInput.class);
   var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
   var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",32000);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
   var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),mock(GroqChatClient.class),m,64,budget,new AnalysisCallPacer());
   long start=System.nanoTime();var chunks=pipeline.partition(response,32000);
   var actual=chunks.stream().flatMap(x->x.input().sessions().stream()).flatMap(x->x.events().stream()).map(x->x.behaviorLogId()).toList();
   var expected=input.sessions().stream().flatMap(x->x.events().stream()).map(x->x.behaviorLogId()).toList();assertThat(actual).containsExactlyElementsOf(expected);
   var row=reports.addObject().put("key",c.path("key").asString()).put("parts",chunks.size()).put("seconds",(System.nanoTime()-start)/1e9).put("allOrderedEventsPreserved",true);row.set("sizes",m.valueToTree(chunks.stream().map(x->x.eventCount()).toList()));
   Files.writeString(root.resolve("partition-budget.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(reports));
  }
 }
}
