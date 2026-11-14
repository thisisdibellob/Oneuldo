package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;import tools.jackson.databind.node.ObjectNode;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import static org.assertj.core.api.Assertions.*;

/** Offline size investigation only; no skipped observations, new inference or measured speed claim. */
@EnabledIfEnvironmentVariable(named="AI_WHOLE_INPUT_PREFLIGHT",matches="true")
class WholeInputLosslessBudgetPreflightTest {
 @Test void largestImmutableRawInputRoundTripsAndReportsItsActualTokenSize()throws Exception{
  var m=JsonMapper.builder().findAndAddModules().build();var root=Path.of(System.getenv("AI_NINE_RUN"));
  var manifest=m.readTree(Files.readString(root.resolve("manifest.json")));var cases=new ArrayList<tools.jackson.databind.JsonNode>();manifest.path("cases").forEach(cases::add);
  var c=cases.stream().max(Comparator.comparingInt(x->x.path("eventCount").asInt())).orElseThrow();var raw=Files.readString(Path.of(c.path("sourcePath").asString()));
  assertThat(QwenTokenCounter.textHash(raw)).isEqualTo(c.path("sourceSha256").asString());var input=m.readValue(raw,BehaviorAnalysisInput.class);var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
  var refs=new AnalysisReferences(m,response);var aliased=(ObjectNode)m.readTree(refs.encode(raw));long start=System.nanoTime();var encoded=ObservationWireEncoding.encode(m,aliased);
  assertThat(ObservationWireEncoding.decode(m,encoded)).isEqualTo(aliased);int tokens=QwenTokenCounter.count(encoded.toString());
  Files.writeString(root.resolve("whole-input-lossless-preflight.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("scope","Offline actual whole-raw-input codec size; no new model run or latency/quality improvement claimed. All original fields/values retained after reference aliasing.","key",c.path("key").asString(),"eventCount",input.eventCount(),"encodedInputTokens",tokens,"requestLimit",32000,"outputReservation",3200,"inputPlusOutputBeforeInstructions",tokens+3200,"wholeRawRoundTripExact",true,"encodingSeconds",(System.nanoTime()-start)/1e9,"eligibleBeforeInstructions",tokens+3200<=32000)));
 }
}
