package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.personalization.domain.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

@Component
public class AdaptiveQuestContract {
    public static final int GENERATION_DEADLINE_SECONDS=operationalLimit("generationDeadlineSeconds");
    public static final int MAXIMUM_AI_CALLS=operationalLimit("maximumAiCalls");
    private static int operationalLimit(String field){
        try(var in=AdaptiveQuestContract.class.getResourceAsStream("/market/adaptive-policy.json")){
            var value=tools.jackson.databind.json.JsonMapper.builder().build().readTree(in).path(field);
            if(!value.isIntegralNumber()||value.asInt()<=0)throw new IllegalStateException("Invalid adaptive operation limit: "+field);
            return value.asInt();
        }catch(java.io.IOException failure){throw new IllegalStateException(failure);}
    }
    private final ObjectMapper mapper;
    private final MarketAiQuestValidator legacy;
    public AdaptiveQuestContract(ObjectMapper mapper,MarketAiQuestValidator legacy){this.mapper=mapper;this.legacy=legacy;}
    public JsonNode policy(){try(var in=getClass().getResourceAsStream("/market/adaptive-policy.json")){return mapper.readTree(in);}catch(java.io.IOException e){throw new IllegalStateException(e);}}
    public MarketAiQuestDraft validate(JsonNode raw,int difficulty,int count,MarketAiQuestRequest.EnvironmentContext context,JsonNode evidence) {
        if(!raw.isObject()) throw problem("/","OBJECT_REQUIRED");
        var old=(ObjectNode)raw.deepCopy();old.remove(List.of("runtimePlan","observationPlan"));
        legacy.validateGeneratedShapeJson(old);legacy.validateGeneratedNumericJson(old);legacy.validateGeneratedTextJson(old);
        shape(raw.path("runtimePlan"),"/runtimePlan",List.of("environment","learning","matchRule","stockPerProduct","stockOverrides","alarmPenaltyPoints","wrongWayPenaltyPoints","cashierRequestPenaltyPoints"));
        var runtime=raw.path("runtimePlan"); var environment=runtime.path("environment");var learning=runtime.path("learning");
        shape(environment,"/runtimePlan/environment",List.of("layoutId","employeeCount","customerCount","pillarCount","chairCount","cashierCount","kioskLane","entranceConstruction"));
        shape(learning,"/runtimePlan/learning",List.of("stockoutProductId","allowSubstitution","budgetChoiceEnabled","choiceBudget","checkoutReviewMode"));
        choice(environment,"layoutId",List.of("classic","aisles","corner"),"/runtimePlan/environment");
        for(String field:List.of("employeeCount","customerCount","pillarCount","chairCount","cashierCount")) range(environment,field,policy().path(field),"/runtimePlan/environment");
        choice(environment,"kioskLane",List.of("none","checkout","checkout-2"),"/runtimePlan/environment");
        bool(environment,"entranceConstruction","/runtimePlan/environment");
        if(!environment.path("kioskLane").asString().equals("none") && environment.path("cashierCount").asInt()>1)throw problem("/runtimePlan/environment/cashierCount","KIOSK_LEAVES_ONE_STAFFED_LANE");
        choice(runtime,"matchRule",List.of("exact","family"),"/runtimePlan");
        choice(learning,"checkoutReviewMode",List.of("normal","overcharge","random"),"/runtimePlan/learning");
        for(String f:List.of("allowSubstitution","budgetChoiceEnabled"))bool(learning,f,"/runtimePlan/learning");
        range(learning,"choiceBudget",policy().path("choiceBudget"),"/runtimePlan/learning");
        range(runtime,"stockPerProduct",policy().path("stockPerProduct"),"/runtimePlan");
        for(String f:List.of("alarmPenaltyPoints","wrongWayPenaltyPoints","cashierRequestPenaltyPoints"))range(runtime,f,policy().path("penaltyPoints"),"/runtimePlan");
        if(!runtime.path("stockOverrides").isObject())throw problem("/runtimePlan/stockOverrides","OBJECT_REQUIRED");
        for(String id:runtime.path("stockOverrides").propertyNames()) {
            MarketQuestCatalog.require(id);integer(runtime.path("stockOverrides").path(id),0,20,"/runtimePlan/stockOverrides/"+id);
        }
        if(!(learning.path("stockoutProductId").isNull() || learning.path("stockoutProductId").isString()))throw problem("/runtimePlan/learning/stockoutProductId","STRING_OR_NULL_REQUIRED");
        var draft=mapper.treeToValue(raw,MarketAiQuestDraft.class);
        legacy.validateGenerated(draft,difficulty,context);
        if(draft.objectives().size()!=count)throw problem("/objectives","PROFILE_ITEM_COUNT_MISMATCH");
        if(!"CUSTOM".equals(draft.scenarioId()))throw problem("/scenarioId","ADAPTIVE_RUNTIME_REQUIRES_CUSTOM");
        if("family".equals(draft.runtimePlan().matchRule())) {
            try(var in=getClass().getResourceAsStream("/market/product-families.json")) {
                var families=mapper.readTree(in);var used=new HashSet<String>();
                for(var objective:draft.objectives())if(!used.add(families.path(objective.productId()).asString(objective.productId())))throw problem("/objectives","OVERLAPPING_PRODUCT_FAMILIES");
            }catch(java.io.IOException e){throw new IllegalStateException(e);}
        }
        String unavailable=draft.runtimePlan().learning().stockoutProductId();
        if(unavailable!=null && draft.objectives().stream().noneMatch(o->o.productId().equals(unavailable)))throw problem("/runtimePlan/learning/stockoutProductId","STOCKOUT_MUST_BE_OBJECTIVE");
        for(var o:draft.objectives()) if(!o.productId().equals(unavailable) && draft.runtimePlan().stockOverrides().getOrDefault(o.productId(),draft.runtimePlan().stockPerProduct())<o.quantity())throw problem("/runtimePlan/stockOverrides","NON_STOCKOUT_TARGET_UNAVAILABLE");
        if(draft.runtimePlan().learning().budgetChoiceEnabled()) {
            int cost=draft.objectives().stream().mapToInt(o->MarketQuestCatalog.require(o.productId()).price()*o.quantity()).sum();
            int minimum=MarketQuestCatalog.PRODUCTS.stream().filter(p->p.categoryId().equals("drink")
                && draft.objectives().stream().noneMatch(o->o.productId().equals(p.id()))
                && p.price()<=draft.runtimePlan().learning().choiceBudget()
                && draft.runtimePlan().stockOverrides().getOrDefault(p.id(),draft.runtimePlan().stockPerProduct())>0).mapToInt(MarketQuestCatalog.Product::price).min().orElse(Integer.MAX_VALUE);
            if(minimum==Integer.MAX_VALUE || (long)cost+minimum>draft.budget())throw problem("/budget","NO_AFFORDABLE_EXTRA_DRINK");
        }
        if(context!=null && context.runtimeContext()!=null) {
            for(String path:context.runtimeContext().path("lockedSettings").propertyNames()) {
                if(!path.startsWith("/runtimePlan/") && !path.equals("/environmentPlan/shelfOrder"))throw problem(path,"UNSUPPORTED_MANUAL_LOCK");
                if(!raw.at(path).equals(context.runtimeContext().path("lockedSettings").get(path)))throw problem(path,"MANUAL_SETTING_LOCKED");
            }
        }
        var p=raw.path("observationPlan");
        shape(p,"/observationPlan",List.of("purpose","behaviorObservation","movementObservation","behaviorEvidenceIds","movementEvidenceIds","alternativeExplanations","unknowns","changeReasons","evaluationFocus"));
        choice(p,"purpose",List.of("GUIDED_PRACTICE","INDEPENDENT_CHECK","TRANSFER","EXPLORATION"),"/observationPlan");
        for(String f:List.of("behaviorObservation","movementObservation","evaluationFocus"))text(p.path(f),360,"/observationPlan/"+f);
        citations(p.path("behaviorEvidenceIds"),AdaptiveQuestEvidence.ids(evidence,false),"/observationPlan/behaviorEvidenceIds",true);
        citations(p.path("movementEvidenceIds"),AdaptiveQuestEvidence.ids(evidence,false),"/observationPlan/movementEvidenceIds",!AdaptiveQuestEvidence.ids(evidence,true).isEmpty());
        if(!AdaptiveQuestEvidence.ids(evidence,true).isEmpty() && p.path("movementEvidenceIds").valueStream().noneMatch(id->AdaptiveQuestEvidence.ids(evidence,true).contains(id.asString())))throw problem("/observationPlan/movementEvidenceIds","NAVIGATION_OR_GEOMETRY_SOURCE_REQUIRED");
        for(String f:List.of("alternativeExplanations","unknowns")) {if(!p.path(f).isArray()||(f.equals("unknowns")&&p.path(f).isEmpty())||p.path(f).size()>4)throw problem("/observationPlan/"+f,"ONE_TO_FOUR_ITEMS_REQUIRED");for(var s:p.path(f))text(s,200,"/observationPlan/"+f);}
        if(!p.path("changeReasons").isArray()||p.path("changeReasons").isEmpty()||p.path("changeReasons").size()>12)throw problem("/observationPlan/changeReasons","ONE_TO_TWELVE_REASONS_REQUIRED");
        for(var c:p.path("changeReasons")) {shape(c,"/observationPlan/changeReasons",List.of("path","reason"));String path=c.path("path").asString();if(!path.startsWith("/")||raw.at(path).isMissingNode()||path.startsWith("/observationPlan"))throw problem(path,"CHANGE_PATH_NOT_IN_QUEST");text(c.path("reason"),200,path);}
        return draft;
    }
    private void citations(JsonNode values,Set<String> allowed,String path,boolean required){if(!values.isArray()||values.size()>12||(required&&values.isEmpty()))throw problem(path,"CITATION_COUNT:"+(required?"1":"0")+"..12");for(var v:values)if(!v.isString()||!allowed.contains(v.asString()))throw problem(path,"UNKNOWN_EVENT_CITATION");}
    private void shape(JsonNode n,String p,List<String> keys){if(!n.isObject()||n.size()!=keys.size())throw problem(p,"EXACT_KEYS_REQUIRED:"+keys);for(String k:keys)if(!n.has(k))throw problem(p+"/"+k,"REQUIRED");}
    /** Collect independent existing constraints so a single repair can fix coexisting errors. */
    public List<Map<String,Object>> independentSettingIssues(JsonNode raw){
        var issues=new ArrayList<Map<String,Object>>();if(!raw.isObject())return issues;
        for(var field:Map.of("title",40,"description",120,"successMessage",80,"adaptationSummary",MarketAiQuestValidator.ADAPTATION_SUMMARY_MAX_LENGTH).entrySet())
            collect(issues,()->text(raw.path(field.getKey()),field.getValue(),"/"+field.getKey()));
        if(raw.path("environmentPlan").isObject())collect(issues,()->text(raw.path("environmentPlan").path("rationale"),160,"/environmentPlan/rationale"));
        for(String field:List.of("briefing","checkoutDialogue"))if(raw.path(field).isArray())for(int i=0;i<raw.path(field).size();i++){int index=i;collect(issues,()->text(raw.path(field).get(index),80,"/"+field+"/"+index));}
        var runtime=raw.path("runtimePlan");var environment=runtime.path("environment");var learning=runtime.path("learning");
        if(environment.isObject())for(String field:List.of("employeeCount","customerCount","pillarCount","chairCount","cashierCount"))collect(issues,()->range(environment,field,policy().path(field),"/runtimePlan/environment"));
        if(learning.isObject())collect(issues,()->range(learning,"choiceBudget",policy().path("choiceBudget"),"/runtimePlan/learning"));
        if(runtime.isObject()){
            collect(issues,()->range(runtime,"stockPerProduct",policy().path("stockPerProduct"),"/runtimePlan"));
            for(String field:List.of("alarmPenaltyPoints","wrongWayPenaltyPoints","cashierRequestPenaltyPoints"))collect(issues,()->range(runtime,field,policy().path("penaltyPoints"),"/runtimePlan"));
            if(runtime.path("stockOverrides").isObject())for(String id:runtime.path("stockOverrides").propertyNames())collect(issues,()->integer(runtime.path("stockOverrides").path(id),0,20,"/runtimePlan/stockOverrides/"+id));
        }
        if(raw.path("objectives").isArray())for(int i=0;i<raw.path("objectives").size();i++){int index=i;collect(issues,()->integer(raw.path("objectives").get(index).path("quantity"),1,3,"/objectives/"+index+"/quantity"));}
        return List.copyOf(issues);
    }
    private void collect(List<Map<String,Object>> issues,Runnable check){try{check.run();}catch(MarketQuestValidationException error){issues.add(error.details());}}
    private void range(JsonNode n,String k,JsonNode bounds,String p){integer(n.path(k),bounds.path(0).asInt(),bounds.path(1).asInt(),p+"/"+k);}
    private void integer(JsonNode n,int min,int max,String p){if(!n.isIntegralNumber()||!n.canConvertToInt()||n.asInt()<min||n.asInt()>max)throw problem(p,"INTEGER_RANGE:"+min+".."+max);}
    private void choice(JsonNode n,String k,List<String> values,String p){if(!n.path(k).isString()||!values.contains(n.path(k).asString()))throw problem(p+"/"+k,"ALLOWED:"+values);}
    private void bool(JsonNode n,String k,String p){if(!n.path(k).isBoolean())throw problem(p+"/"+k,"BOOLEAN_REQUIRED");}
    private void text(JsonNode n,int max,String p){if(!n.isString()||n.asString().isBlank()||n.asString().length()>max)throw problem(p,"TEXT_LENGTH:1.."+max);}
    public static MarketQuestValidationException problem(String path,String code){return new MarketQuestValidationException("적응형 과제 설정",Map.of("code",code,"path",path));}
}
