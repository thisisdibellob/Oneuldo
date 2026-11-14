package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class PriorAiPlanTextTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 @Test void onlyFiveHistoricalAiFieldsAreExcludedAndTheirOriginalHashesRemain(){
  var original=(ObjectNode)m.readTree("{\"events\":[{\"id\":\"E1\",\"x\":0.123456789,\"mission\":{\"objectives\":[{\"productId\":\"milk\",\"quantity\":2}],\"briefing\":[\"우유를 담아 주세요\"],\"checkoutDialogue\":[\"개수를 확인해 주세요\"],\"observationPlan\":{\"behaviorObservation\":\"과거 AI 주장\",\"unknowns\":[\"오류 가능성\"],\"behaviorEvidenceIds\":[\"E885\"],\"evaluationFocus\":\"다음 확인\"}}}]}");
  var before=original.deepCopy();var result=PriorAiPlanText.withhold(m,original);
  assertThat(original).isEqualTo(before);
  assertThat(result.at("/events/0/mission/observationPlan/behaviorObservation").isMissingNode()).isTrue();
  assertThat(result.path(PriorAiPlanText.FIELD).size()).isEqualTo(2);
  assertThat(result.path(PriorAiPlanText.FIELD).get(0).path("sha256").asString()).isEqualTo(QwenTokenCounter.textHash(original.at("/events/0/mission/observationPlan/behaviorObservation").toString()));
  var expected=before.deepCopy();((ObjectNode)expected.at("/events/0/mission/observationPlan")).remove(java.util.List.of("behaviorObservation","unknowns"));
  var factual=result.deepCopy();factual.remove(java.util.List.of(PriorAiPlanText.FIELD,"priorAiTextScope"));assertThat(factual).isEqualTo(expected);
 }
 @Test void reportedExperiencesAndOrdinaryRecordedFieldsAreNeverRemoved(){
  var source=(ObjectNode)m.readTree("{\"behaviorObservation\":\"직접 기록\",\"userExperience\":{\"feedbackNote\":\"실제 보고\"},\"mission\":{\"briefing\":[\"화면 안내\"]}}");
  assertThat(PriorAiPlanText.withhold(m,source)).isEqualTo(source);
 }
 @Test void adaptiveQuestSourcesUseTheSameBoundaryAndPreserveDeliveredConditionsAndAllEvents(){
  var raw=new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification");
  var mission=(ObjectNode)raw.at("/input/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission");
  var plan=mission.putObject("observationPlan");
  plan.put("behaviorObservation","過去AIの推測").put("movementObservation","과거 경로 추측");
  plan.putArray("alternativeExplanations").add("과거 의도 추측");plan.putArray("unknowns").add("과거 불확실성");
  plan.putArray("changeReasons").addObject().put("path","/objectives").put("reason","오래된 변경 설명");
  plan.put("evaluationFocus","실제로 제공된 관찰 목적");plan.putArray("behaviorEvidenceIds").add("E885");
  var input=m.treeToValue(raw.path("input"),oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);
  var before=m.valueToTree(input);var source=oneuldo.behaviorlog.personalization.service.AdaptiveQuestEvidence.build(m,input);
  assertThat((tools.jackson.databind.JsonNode)m.valueToTree(input)).isEqualTo(before);
  assertThat(source.path("eventCount").asInt()).isEqualTo(input.eventCount());
  var delivered=source.at("/recordedTasks/0/mission");
  assertThat(delivered.path("objectives")).isEqualTo(mission.path("objectives"));
  assertThat(delivered.path("briefing")).isEqualTo(mission.path("briefing"));
  assertThat(delivered.path("budget")).isEqualTo(mission.path("budget"));
  assertThat(delivered.at("/observationPlan/behaviorObservation").isMissingNode()).isTrue();
  assertThat(delivered.at("/observationPlan/changeReasons").isMissingNode()).isTrue();
  assertThat(delivered.at("/observationPlan/evaluationFocus")).isEqualTo(plan.path("evaluationFocus"));
  assertThat(source.path(PriorAiPlanText.FIELD)).isNotEmpty();
  assertThat(source.path("sourceEventDetails")).isNotEmpty();
 }
}
