package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.ai.client.SourceOutputSchemas;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class CompactAnalysisReviewTest {
 final MovementProjectionTest fixture=new MovementProjectionTest();
 AnalysisReferences refs(){return new AnalysisReferences(fixture.mapper,fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class));}
 ObjectNode compact(){var e=new AnalysisReviewConsistencyTest().envelope("wrong-specification");e.remove("stationClaims");e.put("reviewFormat",AnalysisReviewWire.FORMAT);return e;}
 @Test void source_lookup_copy_does_not_change_any_ai_authored_content_or_the_raw_response(){
  var e=compact();String raw=e.toString();var expanded=AnalysisReviewWire.expand(e,refs());
  assertThat(expanded.path("analysis")).isEqualTo(e.path("analysis"));assertThat(expanded.path("taskChecks")).isEqualTo(e.path("taskChecks"));
  assertThat(e.toString()).isEqualTo(raw);assertThat(expanded.path("stationClaims").size()).isEqualTo(refs().recordedStations().size());
  String old=AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,new AnalysisReviewConsistencyTest().envelope("wrong-specification").toString(),refs());
  assertThat(fixture.mapper.readTree(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs()))).isEqualTo(fixture.mapper.readTree(old));
 }
 @Test void compact_transport_still_rejects_false_verdict_and_fabricated_citation(){
  var e=compact();((ObjectNode)e.at("/analysis/sessionAssessments/0")).put("judgment","SUCCESS");
  assertThatThrownBy(()->AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,e.toString(),refs())).hasMessage("REVIEW_TASK_JUDGMENT_CONTRADICTION");
  var invented=compact();((ObjectNode)invented.at("/analysis/summary/0")).putArray("evidenceEventIds").add("E999");
  assertThatThrownBy(()->AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,invented.toString(),refs())).hasMessage("UNKNOWN_REVIEW_EVIDENCE");
  var injected=compact();injected.putArray("stationClaims");assertThatThrownBy(()->AnalysisReviewWire.expand(injected,refs())).hasMessage("INVALID_REVIEW_WIRE_FIELDS");
 }
 @Test void schemas_are_bounded_and_dependency_ordered(){
  var s=SourceOutputSchemas.compactAnalysisReview(List.of("E1","E2"),List.of("S1"),fixture.mapper.createArrayNode(),List.of(1));
  assertThat(SourceOutputSchemas.allowed(s)).isTrue();assertThat(s.path("properties").propertyNames()).containsExactly("reviewFormat","taskChecks","analysis","reviewNotes");
  assertThat(s.at("/properties/analysis/properties").propertyNames()).containsExactly("sessionAssessments","summary","findings","uncertainties","practicePlan","usedEvidenceCardIds");
  s.put("additionalProperties",true);assertThat(SourceOutputSchemas.allowed(s)).isFalse();
  var p=SourceOutputSchemas.userProfile(List.of("R1","R7"),List.of("card1"));assertThat(SourceOutputSchemas.allowed(p)).isTrue();
  assertThat(p.at("/properties/findings/items/required").toString()).contains("suggestedSupport");
  ((ObjectNode)p.at("/properties/findings/items/properties/evidenceEventIds/items")).putArray("enum").add("E99");assertThat(SourceOutputSchemas.allowed(p)).isFalse();
 }
 @Test void compact_prompt_preserves_every_source_value_and_remains_idempotent(){
  var input=fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);
  var prompts=new AiBehaviorAnalysisPromptFactory(fixture.mapper);String source=refs().encode(prompts.wholeSourcePrompt(input));
  String old=AnalysisReviewPrompt.build(fixture.mapper,source,null,refs());String wire=AnalysisReviewWire.prompt(fixture.mapper,old);
  var decoder=new FinalSourceEncoding(fixture.mapper);var before=decoder.decode(fixture.mapper.readTree(old));var after=decoder.decode(fixture.mapper.readTree(wire));
  assertThat(after.path(LiteralEventIndex.FIELD)).isEqualTo(LiteralEventIndex.build(fixture.mapper,before));
  for(String k:List.of("reviewVersion","outputContract","stationIdentityContract","generationOrder","taskConsistencyContract","planBasisContract","sessionSourceLedgerRule",ReadableSourceFacts.FIELD,LiteralEventIndex.FIELD)){before.remove(k);after.remove(k);}
  assertThat(after).isEqualTo(before);assertThat(AnalysisReviewWire.prompt(fixture.mapper,wire)).isEqualTo(wire);
 }
 @Test void observation_contract_no_longer_requires_an_invented_alternative(){
  String p=new AiBehaviorAnalysisPromptFactory(fixture.mapper).digestContract();
  assertThat(p).doesNotContain("대안1개를 포함").contains("대안은 직접 근거가 있을 때만", "반증·한계를 빼지 않는다");
 }
}
