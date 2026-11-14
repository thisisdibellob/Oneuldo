package oneuldo.behaviorlog.analysis;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import org.junit.jupiter.api.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class SharedSourceObservationsTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 final Map<String,GroqChatResult> cache=new HashMap<>();
 final AnalysisCheckpoints store=new AnalysisCheckpoints(){
  public Optional<GroqChatResult> find(String s,String p,int o){return Optional.ofNullable(cache.get(s+p+o));}
  public void save(String s,String p,int o,GroqChatResult r){cache.putIfAbsent(s+p+o,r);}
 };
 BehaviorAnalysisInputResponse input() throws Exception {
  var f=Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json");Assumptions.assumeTrue(Files.exists(f));
  var i=m.treeToValue(m.readTree(Files.readString(f)).get(0).path("input_data"),BehaviorAnalysisInput.class);
  return new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
 }
 SharedSourceObservations share(BehaviorAnalysisInputResponse i){return new SharedSourceObservations(m,store,i,new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),1800);}
 AiObservationDigest digest(){return new AiObservationDigest("기록 범위 검토",List.of(),List.of("행동 의도는 확인되지 않음"));}
 @Test void full_ordered_coverage_is_required_and_changed_original_coordinates_do_not_reuse() throws Exception {
  var input=input();var sharing=share(input);var ids=SharedSourceObservations.eventList(input);var parts=List.of(new SharedSourceObservations.Part(ids,digest()));
  sharing.save(parts,parts,"model");assertThat(sharing.load()).isPresent();
  assertThat(sharing.forQuest(sharing.load().orElseThrow()).path("allOriginalEventsRead").asBoolean()).isTrue();
  var reversed=new ArrayList<>(ids);Collections.reverse(reversed);
  assertThatThrownBy(()->sharing.save(List.of(new SharedSourceObservations.Part(reversed,digest())),parts,"model")).hasMessage("SHARED_SOURCE_COVERAGE_MISMATCH");
  assertThatThrownBy(()->sharing.save(List.of(new SharedSourceObservations.Part(ids.subList(0,ids.size()-1),digest())),parts,"model")).hasMessage("SHARED_SOURCE_COVERAGE_INCOMPLETE");
  var changed=m.valueToTree(input.input());
  for(var s:changed.path("sessions"))for(var e:s.path("events"))if(e.path("action").path("eventCode").asString().equals("SHOP.MOVEMENT_SAMPLED")){((tools.jackson.databind.node.ObjectNode)e.path("payload")).put("x",999.123456789);break;}
  var i=m.treeToValue(changed,BehaviorAnalysisInput.class);var copy=new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
  assertThat(share(copy).load()).isEmpty();
 }
 @Test void invalid_cached_citation_cannot_bypass_validation() throws Exception {
  var in=input();var s=share(in);var ids=SharedSourceObservations.eventList(in);var parts=List.of(new SharedSourceObservations.Part(ids,digest()));s.save(parts,parts,"model");
  var original=cache.values().iterator().next();var doc=m.readTree(original.text());
  for(String field:List.of("originalParts","synthesisParts")) {
   var d=(tools.jackson.databind.node.ObjectNode)doc.path(field).get(0).path("digest");
   var o=d.putArray("observations").addObject();o.put("observation","기록 검토").put("interpretation","관찰 검토");o.putArray("alternativeExplanations");o.putArray("evidenceEventIds").add(UUID.randomUUID().toString());
  }
  cache.replaceAll((k,v)->new GroqChatResult(doc.toString(),"model"));assertThat(s.load()).isEmpty();
 }
 @Test void token_memo_preserves_exact_counts_and_is_bounded() {
  String value="원본 좌표 710.123456789 / false / 0 / 수량2";int count=QwenTokenCounter.count(value);long hits=QwenTokenCounter.cacheHits();
  assertThat(QwenTokenCounter.count(value)).isEqualTo(count);assertThat(QwenTokenCounter.cacheHits()).isGreaterThan(hits);
  for(int i=0;i<520;i++)QwenTokenCounter.count("bounded-token-cache "+i);
  assertThat(QwenTokenCounter.cachedEntries()).isLessThanOrEqualTo(512);
 }
}
