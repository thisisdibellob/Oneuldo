package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import oneuldo.ai.client.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ColdAnalysisFixTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 @Test void same_raw_source_keeps_all_ordered_events_exact_values_and_bounded_requests() throws Exception {
  var file=Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json");Assumptions.assumeTrue(Files.exists(file));
  var row=m.readTree(Files.readString(file)).valueStream().filter(r->r.path("id").asString().equals("b9a9e52e-729a-403f-bc6f-3d26460b70fc")).findFirst().orElseThrow();
  var i=m.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);var input=new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
  var prompts=new AiBehaviorAnalysisPromptFactory(m);var refs=new AnalysisReferences(m,input);
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var pipeline=new TimelineAnalysisPipeline(prompts,new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),mock(GroqChatClient.class),m,64,budget,new AnalysisCallPacer());
  long start=System.nanoTime();var parts=pipeline.partition(input,24000);var ids=new ArrayList<UUID>();var report=m.createArrayNode();
  for(var part:parts) {
   ids.addAll(SharedSourceObservations.eventList(part));String base=prompts.observationPrompt(part,input);String legacy=refs.encode(base,false),wire=refs.encode(base);
   var expected=(ObjectNode)new LosslessTables(m).decode(m.readTree(legacy));var actual=ObservationWireEncoding.decode(m,m.readTree(wire));
   for(var v:List.of(expected,actual))v.set("behaviorTimeline",new CompactBehaviorTimeline(m).decodeExpanded(v.path("behaviorTimeline")));
   assertThat(actual).isEqualTo(expected);
   assertThat(QwenTokenCounter.inputTokens(prompts.observationSystem(),wire+"\n구간 64/64: 세션 일부이며 구간 밖 행동을 가정하지 마세요.\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.")+1800+200).isLessThanOrEqualTo(24000);
   report.addObject().put("events",part.eventCount()).put("inputTokens",QwenTokenCounter.count(wire)).put("exactRoundTrip",true);
  }
  assertThat(ids).containsExactlyElementsOf(SharedSourceObservations.eventList(input));
  var out=Path.of("../output/cold-analysis-fix-20261014");Files.createDirectories(out);
  Files.writeString(out.resolve("partition-verification.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("eventCount",ids.size(),"parts",report,"prepareSeconds",(System.nanoTime()-start)/1e9,"originalUnchanged",true)));
 }
 @Test void typed_review_source_limits_baseline_and_preserves_recorded_station_identity() throws Exception {
  var file=Path.of("../output/analysis-speed-quality-20261013/attempt-01-cold/cold-attempts.json");Assumptions.assumeTrue(Files.exists(file));
  var attempt=m.readTree(Files.readString(file)).get(16);
  var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),mock(GroqChatClient.class),m);
  ObjectNode schema=ReflectionTestUtils.invokeMethod(pipeline,"reviewSchema",attempt.path("inputPrompt").asString());
  assertThat(SourceOutputSchemas.allowed(schema)).isTrue();
  assertThat(schema.at("/properties/analysis/properties/practicePlan/properties/rationale/properties/baselineDifficulty/enum").toString()).isEqualTo("[null]");
  assertThat(schema.at("/properties/stationClaims/const").size()).isEqualTo(21);
  var out=Path.of("../output/cold-analysis-fix-20261014");Files.createDirectories(out);Files.writeString(out.resolve("review-format-schema.json"),schema.toString());
  schema.put("$ref","https://untrusted.invalid/schema");assertThat(SourceOutputSchemas.allowed(schema)).isFalse();
 }
 @Test void known_collector_meaning_and_unmeasured_efficiency_cannot_be_published_as_ambiguous_or_measured() {
  String reviewed="{\"verdict\":\"VALID\"}";
  String unknown="{\"analysis\":{\"uncertainties\":[\"ITEM_SEARCH_STARTED가 실제 검색창 사용인지 단순 이동 트리거인지 구분하기 어렵습니다.\"]}}";
  assertThatThrownBy(()->AnalysisLanguageChecks.validate(m,unknown,reviewed)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
  String efficiency="{\"analysis\":{\"findings\":[{\"interpretation\":[{\"text\":\"비효율적인 이동 패턴이 관찰되었습니다.\"}]}]}}";
  assertThatThrownBy(()->AnalysisLanguageChecks.validate(m,efficiency,reviewed)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
  String qualified=efficiency.replace("비효율적인 이동 패턴이 관찰되었습니다.","출입구 재방문이 기록되었으나 경로 효율은 측정하지 않았습니다.");
  assertThatCode(()->AnalysisLanguageChecks.validate(m,qualified,reviewed)).doesNotThrowAnyException();
  assertThatCode(()->AnalysisLanguageChecks.validate(m,"{\"analysis\":{\"uncertainties\":[\"ITEM_SEARCH_STARTED는 자동 이동 신호이며 목표 이해 여부는 미확인입니다.\"]}}",reviewed)).doesNotThrowAnyException();
 }
}
