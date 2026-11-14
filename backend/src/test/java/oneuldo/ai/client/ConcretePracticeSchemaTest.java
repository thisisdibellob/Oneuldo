package oneuldo.ai.client;
import org.junit.jupiter.api.Test;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
class ConcretePracticeSchemaTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 @Test void onlyTheBoundedConcreteVariantIsAllowed(){
  var base=SourceOutputSchemas.compactAnalysisReview(List.of("E1"),List.of("S1"),m.createArrayNode(),List.of());
  var constrained=SourceOutputSchemas.concretePractice(base,false);assertThat(SourceOutputSchemas.allowed(base)).isTrue();assertThat(SourceOutputSchemas.allowed(constrained)).isTrue();
  assertThat(constrained.at("/properties/analysis/properties/findings/items/properties/alternativeExplanations/maxItems").asInt()).isZero();
  ((ObjectNode)constrained.at("/properties/analysis/properties/practicePlan/properties/rationale/properties/proposedPractice")).put("additionalProperties",true);
  assertThat(SourceOutputSchemas.allowed(constrained)).isFalse();
 }
 @Test void literalCauseReportsKeepTheExistingAlternativeCapacity(){
  var base=SourceOutputSchemas.userProfile(List.of("R1"),List.of());var concrete=SourceOutputSchemas.concretePractice(base,true);
  assertThat(SourceOutputSchemas.allowed(concrete)).isTrue();assertThat(concrete.at("/properties/findings/items/properties/alternativeExplanations/maxItems").asInt()).isEqualTo(8);
  assertThat(concrete.at("/properties/practicePlan/properties/rationale/properties").propertyNames()).containsExactly("change","instructions","successCriteria","nextObservation");
  assertThat(base.at("/properties/practicePlan/properties/rationale/type").asString()).isEqualTo("string");
 }
 @Test void callerCannotInjectAnUnboundedSchemaViaTheConcreteVariant(){
  var c=SourceOutputSchemas.concretePractice(SourceOutputSchemas.userProfile(List.of("R1"),List.of()),false);
  c.put("additionalProperties",true);assertThat(SourceOutputSchemas.allowed(c)).isFalse();
 }
 @Test void prepareExplicitTransportProbeOnlyWhenRequested()throws Exception{
  if(!"true".equals(System.getenv("AI_CONCRETE_SCHEMA_PREP")))return;
  java.nio.file.Files.writeString(java.nio.file.Path.of(System.getenv().getOrDefault("AI_SCHEMA_PROBE_PATH","../output/concrete-sections-nine-20261025/probe-schema.json")),SourceOutputSchemas.concretePractice(SourceOutputSchemas.userProfile(List.of("R1"),List.of()),false).toString());
 }
}
