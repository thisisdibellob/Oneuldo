package oneuldo.behaviorlog.personalization.service;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
class AdaptiveQuestDesignTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 final MarketAiQuestValidator v=new MarketAiQuestValidator();
 final AdaptiveQuestContract c=new AdaptiveQuestContract(m,v);
 final AdaptiveMarketQuestService s=new AdaptiveMarketQuestService(null,null,null,null,null,v,c,null,m);
 ObjectNode task(){return (ObjectNode)s.schema();}
 ObjectNode evidence(ObjectNode task){var e=m.createObjectNode();e.putArray("recordedTasks").addObject().set("mission",task);return e;}
 @Test void offers_actual_changes_without_selecting_one_and_respects_manual_locks(){
  var previous=task();var locks=m.createObjectNode();locks.put("/runtimePlan/environment/layoutId","classic");
  var choices=AdaptiveQuestDesign.options(m,evidence(previous),c.policy(),locks);
  assertThat(choices.has("/runtimePlan/environment/layoutId")).isFalse();
  for(String p:choices.propertyNames())for(var value:choices.path(p))assertThat(value).isNotEqualTo(previous.at(p));
  assertThat(choices.path("/environmentPlan/shelfOrder").size()).isEqualTo(10);
 }
 @Test void same_setting_and_unsupported_change_cannot_pass_as_ai_design(){
  var previous=task();var choices=AdaptiveQuestDesign.options(m,evidence(previous),c.policy(),m.createObjectNode());
  var plan=m.createObjectNode().put("path","/runtimePlan/environment/employeeCount").put("value",2).put("reason","직원 도움 기회를 바꿔 관찰합니다");
  assertThatThrownBy(()->AdaptiveQuestDesign.validate(plan,choices)).isInstanceOf(MarketQuestValidationException.class);
  plan.put("value",3);AdaptiveQuestDesign.validate(plan,choices);
  assertThatThrownBy(()->AdaptiveQuestDesign.requireApplied(plan,previous)).isInstanceOf(MarketQuestValidationException.class);
  ((ObjectNode)previous.at("/runtimePlan/environment")).put("employeeCount",3);AdaptiveQuestDesign.requireApplied(plan,previous);
 }
 @Test void real_layout_reference_does_not_treat_first_slot_as_nearest(){
  var slots=AdaptiveQuestDesign.layoutReference(m).at("/layouts/classic/slots");
  assertThat(slots.get(0).path("point").path("y").asInt()).isEqualTo(308);
  assertThat(slots.get(0).path("referenceRoutePx").asInt()).isGreaterThan(slots.get(2).path("referenceRoutePx").asInt());
 }
 @Test void baseline_runtime_outside_mission_is_available_to_condition_design_without_rewriting_original() {
  var previous=task();previous.remove(List.of("runtimePlan","environmentPlan"));var source=evidence(previous);
  var scene=m.createObjectNode();var start=scene.putObject("startingConditions");var geometry=m.createObjectNode();
  geometry.set("config",task().at("/runtimePlan/environment").deepCopy());
  ((ObjectNode)geometry.path("config")).putArray("shelfOrder").add("drink").add("meal").add("household").add("fresh").add("produce");
  start.put("geometry",geometry.toString());var runtime=start.putObject("runtimeConfig");runtime.put("difficulty","exact").put("stockPerProduct",6);
  runtime.putObject("initialStock").put("milk",6);runtime.set("learning",task().at("/runtimePlan/learning"));
  ((ObjectNode)source.path("recordedTasks").get(0)).set("actualConditions",AdaptiveQuestEvidence.actualConditions(m,scene));
  var choices=AdaptiveQuestDesign.options(m,source,c.policy(),m.createObjectNode());
  assertThat(choices).isNotEmpty();assertThat(choices.has("/environmentPlan/shelfOrder")).isTrue();
  assertThat(previous.has("runtimePlan")).isFalse();
  var effective=AdaptiveQuestProgression.latestMission(source);
  assertThat(effective.at("/runtimePlan/environment/layoutId").asString()).isEqualTo("classic");
  assertThat(effective.at("/runtimePlan/stockOverrides").isEmpty()).isTrue();
 }
 @Test void the_actual_saved_baseline_source_populates_played_environment() throws Exception {
  var file=java.nio.file.Path.of("../output/minjae-five-location-fix-20261028/auditor/input-snapshots.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(file));
  var saved=m.readTree(java.nio.file.Files.readString(file));tools.jackson.databind.JsonNode baseline=null;
  for(var snapshot:saved)for(var session:snapshot.path("input_data").path("sessions"))
   if(session.path("sessionId").asString().equals("2146fac6-bbe1-4459-a7f2-5c145ba93761"))baseline=snapshot.path("input_data");
  assertThat(baseline).as("Saved baseline 2 source, independent of later recommendations").isNotNull();
  var input=m.treeToValue(baseline,oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);
  var evidence=AdaptiveQuestEvidence.build(m,input);var actual=AdaptiveQuestProgression.latestMission(evidence);
  assertThat(actual.at("/runtimePlan/environment/employeeCount").asInt()).isEqualTo(1);
  assertThat(actual.at("/environmentPlan/shelfOrder").get(3).asString()).isEqualTo("fresh");
  assertThat(AdaptiveQuestDesign.options(m,evidence,c.policy(),m.createObjectNode())).isNotEmpty();
 }
 @Test void claiming_better_access_for_the_farther_first_slot_is_rejected() {
  var previous=task();((ObjectNode)previous.path("environmentPlan")).putArray("shelfOrder").add("drink").add("meal").add("household").add("fresh").add("produce");
  var next=task();next.putArray("objectives").addObject().put("productId","milk").put("quantity",1);
  ((ObjectNode)next.path("environmentPlan")).putArray("shelfOrder").add("fresh").add("produce").add("drink").add("meal").add("household");
  ((ObjectNode)next.path("environmentPlan")).put("rationale","fresh 카테고리를 첫 번째 매대에 배치하여 흰 우유 접근성을 높입니다.");
  assertThatThrownBy(()->AdaptiveQuestDesign.verifyAccessClaim(m,evidence(previous),next)).isInstanceOf(MarketQuestValidationException.class);
  ((ObjectNode)next.path("environmentPlan")).putArray("shelfOrder").add("drink").add("meal").add("fresh").add("household").add("produce");
  AdaptiveQuestDesign.verifyAccessClaim(m,evidence(previous),next);
 }
 @Test void bounded_layout_choices_are_selected_by_ai_and_cannot_restore_far_first_slot() {
  var previous=task();((ObjectNode)previous.path("environmentPlan")).putArray("shelfOrder").add("drink").add("meal").add("household").add("fresh").add("produce");
  var next=task();next.putArray("objectives").addObject().put("productId","milk").put("quantity",1);
  ((ObjectNode)next.path("environmentPlan")).putArray("shelfOrder").add("fresh").add("produce").add("drink").add("meal").add("household");
  var choices=AdaptiveQuestLayoutChoice.options(m,evidence(previous),next,m.createObjectNode());
  assertThat(choices.size()).isEqualTo(48);
  for(var option:choices) {
   assertThat(option.path("shelfOrder").get(0).asString()).isNotEqualTo("fresh");
   assertThat(option.at("/targetPositions/fresh/afterReferencePx").asInt()).isLessThanOrEqualTo(812);
  }
  var pick=m.createObjectNode().put("choiceId",choices.get(choices.size()-1).path("choiceId").asString());
  assertThat(AdaptiveQuestLayoutChoice.selected(pick,choices)).isEqualTo(choices.get(choices.size()-1));
  pick.put("choiceId","P999");assertThatThrownBy(()->AdaptiveQuestLayoutChoice.selected(pick,choices)).isInstanceOf(MarketQuestValidationException.class);
  var lock=m.createObjectNode().set("/environmentPlan/shelfOrder",next.at("/environmentPlan/shelfOrder"));
  assertThat(AdaptiveQuestLayoutChoice.options(m,evidence(previous),next,lock)).isEmpty();
 }
 @Test void future_delivery_positions_are_separate_from_previous_actual_geometry(){
  var before=task();var next=task();((ObjectNode)next.at("/runtimePlan/environment")).put("layoutId","classic");
  ((ObjectNode)next.path("environmentPlan")).putArray("shelfOrder").add("produce").add("drink").add("fresh").add("meal").add("household");
  var facts=AdaptiveQuestLayoutChoice.deliveryFacts(m,evidence(before),next);
  assertThat(facts.at("/futureShelfPositions/2/categoryId").asString()).isEqualTo("fresh");
  assertThat(facts.at("/futureShelfPositions/2/relativeLocation").asString()).isEqualTo("매장 중앙 왼편");
  assertThat(facts.at("/futureShelfPositions/2/referencePoint/x").asInt()).isEqualTo(500);
  assertThat(facts.path("previousActualShelfOrder")).isEqualTo(before.at("/environmentPlan/shelfOrder"));
 }
 @Test void incorrect_between_shelves_and_future_observations_cannot_pass_delivery_guard(){
  var q=task();((ObjectNode)q.at("/runtimePlan/environment")).put("layoutId","classic");
  ((ObjectNode)q.path("environmentPlan")).putArray("shelfOrder").add("produce").add("drink").add("fresh").add("meal").add("household");
  q.putArray("objectives").addObject().put("productId","milk").put("quantity",1);
  q.putArray("briefing").add("흰 우유 900mL 1개를 담아요.").add("냉장 매대는 과일 매대와 음료 매대 사이에 있습니다.");
  ((ObjectNode)q.path("observationPlan")).put("purpose","GUIDED_PRACTICE").put("behaviorObservation","상품 선택이 기록되는지 관찰합니다.");
  var issues=AdaptiveQuestDeliveryText.issues(m,evidence(task()),q);
  assertThat(issues).anyMatch(x->x.get("error").equals("NONCANONICAL_SPATIAL_CLAIM"));
  assertThat(issues).anyMatch(x->x.get("error").equals("FUTURE_PLAN_IN_PAST_OBSERVATION"));
  var lines=AdaptiveQuestDeliveryText.requiredLines(m,evidence(task()),q);
  assertThat(lines.get(0).asString()).isEqualTo("냉장 식품 진열대는 매장 중앙 왼편에 있어요.");
  q.set("briefing",lines);q.put("description","흰 우유 한 개를 담아요.").put("adaptationSummary","흰 우유 한 개 선택을 연습해요.");
  ((ObjectNode)q.path("environmentPlan")).put("rationale","목표 상품과 배치를 조정합니다.");
  ((ObjectNode)q.path("observationPlan")).put("behaviorObservation","상품 선택이 기록되지 않았습니다.").put("movementObservation","매대 열기가 기록되지 않았습니다.");
  assertThat(AdaptiveQuestDeliveryText.issues(m,evidence(task()),q)).isEmpty();
 }
 @Test void focused_response_keeps_exact_json_with_optional_outer_fence_only(){
  String raw="{\"patches\":[]}";
  assertThat(AdaptiveQuestDeliveryText.parseResponse(m,"```json\n"+raw+"\n```")).isEqualTo(m.readTree(raw));
  assertThatThrownBy(()->AdaptiveQuestDeliveryText.parseResponse(m,"설명: "+raw)).isInstanceOf(RuntimeException.class);
 }
 @Test void actual_focused_input_retains_navigation_and_fits_request_budget() throws Exception {
  var root=java.nio.file.Path.of("../output/minjae-five-location-fix-20261028");org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(root.resolve("auditor/generations.json")));
  var gens=m.readTree(java.nio.file.Files.readString(root.resolve("auditor/generations.json")));tools.jackson.databind.JsonNode old=null;String snapshotId=null;
  for(var g:gens)for(var a:g.path("attempts"))if(a.path("validationDetails").path("stage").asString().equals("DELIVERY_TEXT_REPAIR")){
   var prompt=m.readTree(a.path("validationDetails").path("submittedPrompt").asString());
   if(prompt.has("candidate")){old=prompt;snapshotId=g.path("analysis_input_snapshot_id").asString();}
  }
  org.junit.jupiter.api.Assumptions.assumeTrue(old!=null&&old.has("candidate"));
  var saved=m.readTree(java.nio.file.Files.readString(root.resolve("auditor/input-snapshots.json")));tools.jackson.databind.JsonNode source=null;
  for(var snapshot:saved)if(snapshot.path("id").asString().equals(snapshotId))source=snapshot.path("input_data");
  assertThat(source).as("Original generation's source snapshot").isNotNull();
  var original=m.treeToValue(source,oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);var evidence=AdaptiveQuestEvidence.build(m,original);
  var input=AdaptiveQuestDeliveryText.repairInput(m,evidence,old.path("candidate"),old.path("originalInteractionRows"));
  int required=oneuldo.behaviorlog.analysis.service.QwenTokenCounter.inputTokens(AdaptiveQuestDeliveryText.SYSTEM,input.toString())+2100+32;
  var recordDir=java.nio.file.Path.of("build/test-records");java.nio.file.Files.createDirectories(recordDir);
  java.nio.file.Files.writeString(recordDir.resolve("focused-exact-input-budget.json"),m.writeValueAsString(Map.of("system",AdaptiveQuestDeliveryText.SYSTEM,"input",input,"requiredTokens",required,"scope","technical fixture; not actual play")));
  assertThat(input.path("originalNavigationTransitions")).isNotEmpty();assertThat(input.has("candidate")).isFalse();assertThat(required).isLessThanOrEqualTo(32000);
 }
}
