package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Joins four model-authored fields into the unchanged public rationale string, without editing prose. */
public final class ConcretePracticeSections {
 public static final List<String> FIELDS=List.of("change","instructions","successCriteria","nextObservation");
 public static final String PROFILE_RULE="Negotiated concrete practice format overrides rationale:string: practicePlan.rationale is exactly four nonempty Korean strings change,instructions,successCriteria,nextObservation. Write actual condition change, player steps (open shelf before selection/quantity, check cart), exact achievement criteria and next observed events without section labels. change states known retained/changed budget/time/stock/layout/support; unavailable values stay unknown. CurrentProductSources gives original prices/units/INITIAL stock, not later availability. No regex/extra fields. Transport only joins model-authored text; source/content checks remain.";
 private ConcretePracticeSections(){}
 public static String reviewText(ObjectMapper m,String raw){return m.writeValueAsString(review(m,m.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw)));}
 public static String profileText(ObjectMapper m,String raw){return m.writeValueAsString(profile(m,m.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw)));}
 public static ObjectNode review(ObjectMapper m,JsonNode root){var copy=(ObjectNode)root.deepCopy();join(copy.at("/analysis/practicePlan/rationale"),"proposedPractice");return copy;}
 public static ObjectNode profile(ObjectMapper m,JsonNode root){var copy=(ObjectNode)root.deepCopy();join(copy.path("practicePlan"),"rationale");return copy;}
 private static void join(JsonNode parent,String key){
  var value=parent.path(key);if(!value.isObject())return;
  if(!(parent instanceof ObjectNode object)||!value.propertyNames().equals(new HashSet<>(FIELDS)))throw new IllegalArgumentException("INVALID_CONCRETE_PRACTICE_SECTIONS");
  for(String field:FIELDS)if(!value.path(field).isString()||value.path(field).asString().isBlank())throw new IllegalArgumentException("INVALID_CONCRETE_PRACTICE_SECTIONS");
  object.put(key,"변경: "+value.path("change").asString()+" 안내: "+value.path("instructions").asString()+" 달성: "+value.path("successCriteria").asString()+" 확인: "+value.path("nextObservation").asString());
 }
}
