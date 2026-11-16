package oneuldo.behaviorlog.personalization.service;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
/** Exact spatial delivery contract; never author a fallback quest or change AI-selected settings. */
final class AdaptiveQuestDeliveryText {
 static final List<String> PATHS=List.of("/description","/briefing","/adaptationSummary","/environmentPlan/rationale","/observationPlan");
 static final String SYSTEM="Write the five TEXT fields afresh for questConfiguration chosen by the application AI. Use original source facts and intendedPracticePlan, not prior AI prose. GUIDED_PRACTICE after no shelf opening aims to support first selection; do not relabel it as a transfer or adaptation-ability test. Do not call help dependence or cart checking unnecessary. System-owned checkout is not actor behavior. Never state expected visibility/access/learning effects as achieved facts. Return ONLY a valid JSON object matching outputSchema. Quote every key with double quotes. The five root keys are description, briefing, adaptationSummary, rationale, observationPlan. No patches array. Include every required nested field, especially changeReasons and at least one unknown. Never change objectives, shelf order, runtime settings or budget. All text is Korean. For GUIDED_PRACTICE copy each requiredLocationLines sentence EXACTLY into briefing as its own line; these lines come from actual future game geometry. Do not describe positions anywhere else: no between/left/right/front/back/index/coordinate claims elsewhere. Other briefing lines should state exact target product/quantity, selecting/adding and checking the cart; location questions to staff are available. Staff give text directions, not physical escort. description and adaptationSummary describe only this future task; no claims of observed effects. environmentPlan.rationale names actual condition changes without positional claims or improvement certainty. In observationPlan, behaviorObservation and movementObservation describe ONLY past recorded actions from originalInteractionRows, never future questions, expected effects or instructions. Put all future observations in evaluationFocus. Empty alternatives [] when no original record states a cause. Never infer confusion, intent, cognitive load or skill. Keep useful unknowns without claiming missing data when a completed trace establishes event absence. Preserve purpose and use actual historical E IDs for citations. Every changeReasons.path is a JSON POINTER starting with /, such as /objectives or /runtimePlan/environment/employeeCount. Never use dotted paths. Do not call cart checks unnecessary or claim adaptation ability. Include the exact selected product name, size/package and quantity in briefing. Missing facts from one projection are not missing full-source data. Existing field lengths apply: description120, briefing2..5 lines each80, adaptationSummary120, rationale160, behaviorObservation/movementObservation280, evaluationFocus200. originalInteractionRows are exact original ordered [id,eventCode,timeMs,itemId,quantityBefore,quantityAfter,actionType,stationId]; all original source was read in generation and will be checked again independently.";
 static ObjectNode repairInput(ObjectMapper m,JsonNode evidence,JsonNode candidate,JsonNode actions){
  var input=m.createObjectNode();var config=input.putObject("questConfiguration");
  for(String f:List.of("difficulty","budget","objectives","timeLimitSeconds","runtimePlan"))config.set(f,candidate.path(f));
  config.putObject("environmentPlan").set("shelfOrder",candidate.at("/environmentPlan/shelfOrder"));config.put("purpose",candidate.at("/observationPlan/purpose").asString());
  var previous=AdaptiveQuestProgression.latestMission(evidence);if(previous!=null)input.set("previousActualObjectives",previous.path("objectives"));
  var products=input.putArray("selectedProducts");for(var objective:candidate.path("objectives"))for(var p:MarketQuestCatalog.PRODUCTS)if(p.id().equals(objective.path("productId").asString()))products.addObject().put("id",p.id()).put("name",p.name()).put("detail",p.detail()).put("categoryId",p.categoryId()).put("price",p.price());
  input.set("literalDeliveryFacts",AdaptiveQuestLayoutChoice.deliveryFacts(m,evidence,candidate));input.set("requiredLocationLines",requiredLines(m,evidence,candidate));input.set("originalInteractionRows",actions);
  var outcomes=input.putArray("originalOutcomeAndOwnership");for(var event:evidence.path("sourceEventDetails"))if(Set.of("SHOP.SESSION_ENDED","SHOP.CHECKOUT_CONFIRMED","SHOP.SUBMISSION_COMPLETED").contains(event.path("eventCode").asString())) {
   var row=outcomes.addObject();for(String f:List.of("id","eventCode","cart","cartItemCount","cartTotalAmount","sessionEnd","replayExecutionContext","runtimeOutcomeEvents"))if(event.has(f))row.set(f,event.get(f));
  }
  var transitions=input.putArray("originalNavigationTransitions");for(var session:evidence.path("navigationContext").path("sessions"))for(var row:session.path("movementEventDetails"))transitions.add(row);
  input.put("scope","All original interaction rows are provided in order. Absent selection/shelf-open actions in this completed record establish their absence, not intent. Terminal system-owned actions do not establish actor independence. Full raw navigation and every source event remain in generation and final review. Do not invent a route from interaction absence.");
  input.set("outputSchema",outputSchema(m));return input;
 }
 static ObjectNode outputSchema(ObjectMapper m){
  var s=m.createObjectNode().put("type","object").put("additionalProperties",false);var p=s.putObject("properties");
  p.set("description",text(m,120));p.set("briefing",array(m,text(m,80),2,5));p.set("adaptationSummary",text(m,120));p.set("rationale",text(m,160));
  var obs=p.putObject("observationPlan").put("type","object").put("additionalProperties",false);var op=obs.putObject("properties");
  op.set("purpose",text(m,40));for(String f:List.of("behaviorObservation","movementObservation","evaluationFocus"))op.set(f,text(m,360));
  for(String f:List.of("behaviorEvidenceIds","movementEvidenceIds"))op.set(f,array(m,text(m,20),1,12));
  op.set("alternativeExplanations",array(m,text(m,200),0,4));op.set("unknowns",array(m,text(m,200),1,4));
  var change=m.createObjectNode().put("type","object").put("additionalProperties",false);change.putArray("required").add("path").add("reason");var cp=change.putObject("properties");var pathSchema=text(m,120);var allowed=pathSchema.putArray("enum");for(String path:List.of("/objectives","/budget","/timeLimitSeconds","/runtimePlan/environment/layoutId","/runtimePlan/environment/employeeCount","/runtimePlan/environment/customerCount","/runtimePlan/environment/pillarCount","/runtimePlan/environment/chairCount","/environmentPlan/shelfOrder","/briefing","/runtimePlan/learning/stockoutProductId","/runtimePlan/learning/checkoutReviewMode","/runtimePlan/learning/budgetChoiceEnabled"))allowed.add(path);cp.set("path",pathSchema);cp.set("reason",text(m,200));op.set("changeReasons",array(m,change,1,12));
  var req=obs.putArray("required");op.propertyNames().forEach(req::add);req=s.putArray("required");p.propertyNames().forEach(req::add);return s;
 }
 private static ObjectNode text(ObjectMapper m,int max){return m.createObjectNode().put("type","string").put("minLength",1).put("maxLength",max);}
 private static ObjectNode array(ObjectMapper m,JsonNode item,int min,int max){var a=m.createObjectNode().put("type","array").put("minItems",min).put("maxItems",max);a.set("items",item);return a;}
 static JsonNode asPatch(ObjectMapper m,JsonNode response){
  if(!response.isObject()||!response.propertyNames().equals(Set.of("description","briefing","adaptationSummary","rationale","observationPlan")))throw AdaptiveQuestContract.problem("/briefing","FOCUSED_TEXT_OBJECT_REQUIRED");
  var out=m.createObjectNode();var patches=out.putArray("patches");for(String path:PATHS){String key=path.substring(path.lastIndexOf('/')+1);patches.addObject().put("path",path).set("value",response.get(key));}return out;
 }
 /**
  * The text rewrite replaces the whole observationPlan, but only its prose is being rewritten.
  * The purpose is a fixed code the model chose when it designed the quest (and was shown here as questConfiguration.purpose);
  * a rewritten sentence in its place was failing the enum check. Fields the rewrite does not carry are kept as they were.
  */
 static void keepNonTextChoices(JsonNode before,JsonNode candidate){
  if(!(candidate.path("observationPlan") instanceof ObjectNode plan)||!before.isObject())return;
  if(before.path("purpose").isString())plan.set("purpose",before.get("purpose"));
  for(String field:before.propertyNames())if(!plan.has(field))plan.set(field,before.get(field));
 }
 static JsonNode parseResponse(ObjectMapper m,String raw){
  String value=raw.strip();
  if(value.startsWith("```json\n")&&value.endsWith("\n```"))value=value.substring(8,value.length()-4);
  else if(value.startsWith("```\n")&&value.endsWith("\n```"))value=value.substring(4,value.length()-4);
  return m.readTree(value);
 }
 static ArrayNode requiredLines(ObjectMapper m,JsonNode evidence,JsonNode candidate) {
  var categories=new HashSet<String>();for(var o:candidate.path("objectives"))for(var p:MarketQuestCatalog.PRODUCTS)if(p.id().equals(o.path("productId").asString()))categories.add(p.categoryId());
  var out=m.createArrayNode();for(var p:AdaptiveQuestLayoutChoice.deliveryFacts(m,evidence,candidate).path("futureShelfPositions"))if(categories.contains(p.path("categoryId").asString()))out.add(p.path("shelfLabel").asString()+" 진열대는 "+p.path("relativeLocation").asString()+"에 있어요.");
  return out;
 }
 static List<Map<String,Object>> issues(ObjectMapper m,JsonNode evidence,JsonNode candidate) {
  var problems=new ArrayList<Map<String,Object>>();var lines=requiredLines(m,evidence,candidate);var allowed=new HashSet<String>();lines.forEach(x->allowed.add(x.asString()));
  if("GUIDED_PRACTICE".equals(candidate.at("/observationPlan/purpose").asString()))for(var line:lines) {
   boolean found=false;for(var text:candidate.path("briefing"))found|=text.equals(line);
   if(!found)problems.add(Map.of("path","/briefing","error","MISSING_EXACT_FUTURE_LOCATION","requiredLine",line.asString()));
  }
  for(var text:candidate.path("briefing"))if(spatial(text.asString())&&!allowed.contains(text.asString()))problems.add(Map.of("path","/briefing","error","NONCANONICAL_SPATIAL_CLAIM"));
  for(String path:List.of("/description","/adaptationSummary","/environmentPlan/rationale"))if(spatial(candidate.at(path).asString()))problems.add(Map.of("path",path,"error","SPATIAL_CLAIM_OUTSIDE_LOCATION_LINE"));
  for(String field:List.of("behaviorObservation","movementObservation"))if(candidate.path("observationPlan").path(field).asString().matches("(?s).*(이번|관찰합니다|관찰할|확인합니다|확인할|평가합니다|평가할|유도|늘려|지원합니다).*"))problems.add(Map.of("path","/observationPlan","error","FUTURE_PLAN_IN_PAST_OBSERVATION"));
  return problems;
 }
 private static boolean spatial(String s){return s.matches("(?s).*(왼|오른|사이에|안쪽|중앙|위쪽|아래쪽|좌표|인덱스).*");}
 static void requireValid(ObjectMapper m,JsonNode evidence,JsonNode candidate){var found=issues(m,evidence,candidate);if(!found.isEmpty())throw new MarketQuestValidationException("실제 배치 안내와 관찰 시점을 바로잡아야 합니다",Map.of("path","/briefing","code","CONCRETE_DELIVERY_TEXT_REQUIRED","deliveryIssues",found,"requiredLocationLines",requiredLines(m,evidence,candidate)));}
}
