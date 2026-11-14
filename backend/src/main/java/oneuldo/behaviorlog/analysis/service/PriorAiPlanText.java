package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Excludes embedded prior AI hypotheses, never recorded actions or delivered task instructions. */
public final class PriorAiPlanText {
    public static final String FIELD="withheldPriorAiPlanText";
    private static final Set<String> CLAIMS=Set.of("behaviorObservation","movementObservation","alternativeExplanations","unknowns","changeReasons");
    private PriorAiPlanText(){}
    public static ObjectNode withhold(ObjectMapper m,ObjectNode source){
        var result=source.deepCopy();var removed=m.createArrayNode();walk(m,result,"",removed);
        if(!removed.isEmpty()) {
            var audit=result.has(FIELD)&&result.path(FIELD).isArray()?(ArrayNode)result.get(FIELD):result.putArray(FIELD);
            removed.forEach(audit::add);
            result.put("priorAiTextScope","Only embedded mission observationPlan AI reports/hypotheses were withheld; exact original text remains in the immutable input snapshot, identified by path and SHA-256. Actual event order/coordinates, objectives, briefing, checkout text, mechanics, support and environment remain. Exclusion establishes no action, cause or outcome.");
        }
        return result;
    }
    private static void walk(ObjectMapper m,JsonNode n,String path,ArrayNode audit){
        if(n instanceof ObjectNode o)for(String key:new ArrayList<>(o.propertyNames())) {
            if(key.equals(FIELD)||key.equals("currentAnalysis")||key.equals("previousProfile"))continue;
            String next=path+"/"+key.replace("~","~0").replace("/","~1");var value=o.get(key);
            if(Set.of("mission","missionSnapshot").contains(key)&&value.path("observationPlan") instanceof ObjectNode plan){
                for(String field:new TreeSet<>(CLAIMS))if(plan.has(field)) {
                    JsonNode old=plan.remove(field);
                    audit.addObject().put("path",next+"/observationPlan/"+field).put("sha256",QwenTokenCounter.textHash(old.toString()));
                }
            }
            walk(m,value,next,audit);
        } else if(n.isArray())for(int i=0;i<n.size();i++)walk(m,n.get(i),path+"/"+i,audit);
    }
}
