package oneuldo.behaviorlog.personalization.service;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
/** Compile only the original AI's explicit bounded choice; no fallback or auto-picked quest. */
final class AdaptiveQuestLayoutChoice {
 static final String SYSTEM="Choose one layout choiceId from options for this future practice. Each option maps exact shelfOrder indexes to actual game geometry and reference distances. The previous candidate's position claims were wrong. Do not generate a permutation or infer that index 0 is near the entrance. Pick a practical option for the listed objectives and current profile. Prefer retaining unrelated placements when equally suitable. Return ONLY {choiceId:string} using a supplied ID. You select the arrangement; the app applies that exact option. No claim of human learning or measured route improvement is requested.";
 static ArrayNode options(ObjectMapper m,JsonNode evidence,JsonNode candidate,JsonNode locks) {
  var out=m.createArrayNode();
  for(String lock:locks.propertyNames())if(lock.equals("/environmentPlan/shelfOrder")||lock.equals("/environmentPlan"))return out;
  var previous=AdaptiveQuestProgression.latestMission(evidence);if(previous==null)return out;
  var ref=AdaptiveQuestDesign.layoutReference(m).path("layouts");
  var before=ref.path(previous.at("/runtimePlan/environment/layoutId").asString()).path("slots");
  var after=ref.path(candidate.at("/runtimePlan/environment/layoutId").asString()).path("slots");
  var permutations=new ArrayList<List<String>>();permute(new ArrayList<>(List.of("fresh","produce","drink","meal","household")),0,permutations);
  for(var order:permutations) {
   boolean valid=true;var distances=m.createObjectNode();
   for(var objective:candidate.path("objectives"))for(var product:MarketQuestCatalog.PRODUCTS)if(product.id().equals(objective.path("productId").asString())) {
    int prior=-1;var old=previous.at("/environmentPlan/shelfOrder");for(int i=0;i<old.size();i++)if(old.get(i).asString().equals(product.categoryId()))prior=i;
    int index=order.indexOf(product.categoryId());
    if(prior<0||!before.path(prior).path("referenceRoutePx").isNumber()||!after.path(index).path("referenceRoutePx").isNumber()){valid=false;break;}
    int a=before.path(prior).path("referenceRoutePx").asInt(),b=after.path(index).path("referenceRoutePx").asInt();
    if(b>a){valid=false;break;}
    distances.putObject(product.categoryId()).put("index",index).put("beforeReferencePx",a).put("afterReferencePx",b).set("point",after.path(index).path("point"));
   }
   if(valid)out.addObject().put("choiceId","P"+(out.size()+1)).set("shelfOrder",m.valueToTree(order)).set("targetPositions",distances);
  }
  return out;
 }
 private static void permute(List<String> a,int n,List<List<String>> out){if(n==a.size()){out.add(List.copyOf(a));return;}for(int i=n;i<a.size();i++){Collections.swap(a,n,i);permute(a,n+1,out);Collections.swap(a,n,i);}}
 static ObjectNode deliveryFacts(ObjectMapper m,JsonNode evidence,JsonNode candidate) {
  var out=m.createObjectNode();out.put("scope","FUTURE candidate geometry only. Past recordedGeometry belongs to the prior play and must not be used as the new placement. Do not display numeric coordinates or category IDs to the learner. Staff answer location questions in text; they do not escort, point arrows or automatically open help.");
  var previous=AdaptiveQuestProgression.latestMission(evidence);
  if(previous!=null){out.set("previousActualEnvironment",previous.at("/runtimePlan/environment"));out.set("previousActualShelfOrder",previous.at("/environmentPlan/shelfOrder"));}
  if(candidate==null||!candidate.isObject())return out;
  out.set("futureEnvironment",candidate.at("/runtimePlan/environment"));out.set("futureShelfOrder",candidate.at("/environmentPlan/shelfOrder"));
  var layout=AdaptiveQuestDesign.layoutReference(m).path("layouts").path(candidate.at("/runtimePlan/environment/layoutId").asString());
  var slots=layout.path("slots");var rows=out.putArray("futureShelfPositions");
  int minY=Integer.MAX_VALUE;for(var slot:slots)minY=Math.min(minY,slot.path("point").path("y").asInt());
  var names=Map.of("fresh","냉장 식품","produce","과일/채소","drink","음료","meal","간편 식품","household","생활용품");
  var order=candidate.at("/environmentPlan/shelfOrder");
  for(int i=0;i<Math.min(order.size(),slots.size());i++) {
   var point=slots.path(i).path("point");int x=point.path("x").asInt(),y=point.path("y").asInt();int left=0,right=0;
   for(var slot:slots)if(Math.abs(slot.path("point").path("y").asInt()-y)<70){int sx=slot.path("point").path("x").asInt();if(sx<x)left++;if(sx>x)right++;}
   String side=left==0&&right==0?"가운데":left==0?"왼편":right==0?"오른편":"가운데";
   var row=rows.addObject();row.put("categoryId",order.path(i).asString());row.put("shelfLabel",names.getOrDefault(order.path(i).asString(),order.path(i).asString()));
   row.put("relativeLocation","매장 "+(y<=minY+70?"안쪽":"중앙")+" "+side);row.set("referencePoint",point);row.put("index",i);
  }
  return out;
 }
 static ObjectNode schema(ObjectMapper m,ArrayNode options){var s=m.createObjectNode().put("type","object").put("additionalProperties",false);s.putArray("required").add("choiceId");var field=s.putObject("properties").putObject("choiceId").put("type","string");var ids=field.putArray("enum");for(var option:options)ids.add(option.path("choiceId").asString());return s;}
 static JsonNode selected(JsonNode response,ArrayNode options){
  if(!response.isObject()||!response.propertyNames().equals(Set.of("choiceId")))throw AdaptiveQuestContract.problem("/environmentPlan/shelfOrder","INVALID_LAYOUT_CHOICE");
  for(var option:options)if(option.path("choiceId").equals(response.path("choiceId")))return option;
  throw AdaptiveQuestContract.problem("/environmentPlan/shelfOrder","INVALID_LAYOUT_CHOICE");
 }
}
