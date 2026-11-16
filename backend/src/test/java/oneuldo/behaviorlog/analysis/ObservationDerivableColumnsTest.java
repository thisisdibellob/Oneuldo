package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.*;import tools.jackson.databind.JsonNode;import tools.jackson.databind.json.JsonMapper;import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
/** The observation request drops only columns that the same request still determines exactly, and every event survives. */
class ObservationDerivableColumnsTest {
 static final Path CASES=Path.of("../output/source-ledger-nine-20261024/cases");
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 BehaviorAnalysisInput source(String key) throws Exception {
  var file=CASES.resolve(key).resolve("input.json");Assumptions.assumeTrue(Files.exists(file));
  return m.readValue(Files.readString(file),BehaviorAnalysisInput.class);
 }
 BehaviorAnalysisInputResponse response(BehaviorAnalysisInput i){return new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);}
 List<JsonNode> sentEvents(BehaviorAnalysisInputResponse input) {
  String prompt=new AnalysisReferences(m,input).encode(new AiBehaviorAnalysisPromptFactory(m).observationPrompt(input,input));
  var root=ObservationWireEncoding.decode(m,m.readTree(prompt));
  assertThat(root.path("inputScope").asString()).contains("timing.remainingMs").contains("movementSpan.maxTimedPositionError");
  var events=new ArrayList<JsonNode>();
  for(var session:new CompactBehaviorTimeline(m).decodeExpanded(root.path("behaviorTimeline")).path("sessions"))session.path("events").forEach(events::add);
  return events;
 }
 @Test void every_event_keeps_its_id_order_and_elapsed_time_while_the_derivable_remaining_time_is_omitted() throws Exception {
  var data=source("adult-minjae-unit-support-research-v2-1-baseline-pre");var input=response(data);
  var original=data.sessions().stream().flatMap(s->s.events().stream()).toList();var sent=sentEvents(input);
  assertThat(sent).hasSize(original.size());
  int timed=0;
  for(int i=0;i<sent.size();i++) {
   assertThat(sent.get(i).path("behaviorLogId").asString()).isEqualTo("E"+(i+1));
   assertThat(sent.get(i).path("sequence").asLong()).isEqualTo(original.get(i).sequence());
   assertThat(sent.get(i).path("action").path("eventCode").asString()).isEqualTo(original.get(i).action().eventCode());
   var before=m.valueToTree(original.get(i).payload()).path("timing");var after=sent.get(i).path("payload").path("timing");
   if(!before.has("remainingMs"))continue;
   timed++;
   assertThat(before.path("remainingMs").asLong()).isEqualTo(before.path("timeLimitSeconds").asLong()*1000-before.path("elapsedMs").asLong());
   assertThat(after.has("remainingMs")).isFalse();
   assertThat(after.path("elapsedMs").toString()).isEqualTo(before.path("elapsedMs").toString());
   assertThat(after.path("timeLimitSeconds").toString()).isEqualTo(before.path("timeLimitSeconds").toString());
   assertThat(sent.get(i).path("payload").path("marketContent").path("movementSpan").has("maxTimedPositionError")).isFalse();
  }
  assertThat(timed).isPositive();
 }
 @Test void remaining_time_stays_when_one_event_breaks_the_identity() throws Exception {
  var tree=(ObjectNode)m.valueToTree(source("adult-minjae-unit-support-research-v2-1-baseline-pre"));
  ObjectNode changed=null;
  for(var session:tree.path("sessions"))for(var event:session.path("events"))
   if(changed==null&&event.path("payload").path("timing") instanceof ObjectNode timing&&timing.has("remainingMs")){timing.put("remainingMs",0);changed=timing;}
  assertThat(changed).isNotNull();
  var sent=sentEvents(response(m.treeToValue(tree,BehaviorAnalysisInput.class)));
  assertThat(sent.stream().filter(e->e.path("payload").path("timing").has("elapsedMs")))
    .isNotEmpty().allMatch(e->e.path("payload").path("timing").has("remainingMs"));
 }
}
