package oneuldo.ai.client;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;

/** Fixed structures with a bounded, request-local set of source references. No free-form schemas. */
public final class SourceOutputSchemas {
    private static final ObjectMapper M=JsonMapper.builder().build();
    private static final String DIGEST="/properties/observations/items/properties/evidenceEventIds/items";
    private static final String ADAPTIVE="/properties/evidenceIds/items";
    private static final String QUEST_REVIEW="/properties/issues/items/properties/sourceEvidenceIds/items";
    public static final List<String> QUEST_REVIEW_PATHS=List.of("/title","/description","/objectives","/budget","/briefing","/checkoutDialogue","/successMessage","/adaptationSummary","/reasonCodes","/environmentPlan","/environmentPlan/rationale","/timeLimitSeconds","/runtimePlan","/runtimePlan/environment","/runtimePlan/learning","/observationPlan");
    private SourceOutputSchemas() {}
    private static ObjectNode practiceSections(){var s=obj(Map.of("change",string(),"instructions",string(),"successCriteria",string(),"nextObservation",string()));reorder(s,List.of("change","instructions","successCriteria","nextObservation"));return s;}
    /** Fixed schema variant; grammar requires the design sections in the FIRST response. */
    public static ObjectNode concretePractice(ObjectNode schema,boolean allowAlternatives) {
        var result=schema.deepCopy();boolean review=result.path("properties").has("analysis");
        String prefix=review?"/properties/analysis/properties":"/properties";
        var plan=(ObjectNode)result.at(prefix+"/practicePlan/properties");
        if(review)((ObjectNode)plan.at("/rationale/properties")).set("proposedPractice",practiceSections());
        else plan.set("rationale",practiceSections());
        if(!allowAlternatives)((ObjectNode)result.at(prefix+"/findings/items/properties/alternativeExplanations")).put("maxItems",0);
        return result;
    }
    /** Exact bounded prose keys, not arbitrary JSON patches or source/decision mutations. */
    public static final String UNKNOWN_CAUSE_TEXT="원인은 기록으로 확인할 수 없습니다.";
    public static ObjectNode groundedTextPatch(Collection<String> paths) { return groundedTextPatch(paths,List.of()); }
    public static ObjectNode groundedTextPatch(Collection<String> paths,Collection<String> causeOnlyPaths) {
        if(!paths.containsAll(causeOnlyPaths)||causeOnlyPaths.stream().anyMatch(p->!p.matches("/(?:uncertainties/[0-9]+|findings/[0-9]+/alternativeExplanations/[0-9]+(?:/text)?)")))throw new IllegalArgumentException("INVALID_CAUSE_ONLY_PATHS");
        if(paths.isEmpty()||paths.size()>32||new HashSet<>(paths).size()!=paths.size())throw new IllegalArgumentException("INVALID_GROUNDED_PATCH_PATHS");
        var fields=new LinkedHashMap<String,JsonNode>();
        for(String path:new TreeSet<>(paths)) {
            if(path.length()>160 || !path.matches("/(?:summary(?:/[0-9]+/text)?|uncertainties/[0-9]+|findings/[0-9]+/(?:suggestedSupport|(?:observation|interpretation)(?:/[0-9]+/text)?|alternativeExplanations(?:/[0-9]+(?:/text)?)?)|practicePlan/(?:goal|rationale(?:/proposedPractice)?)|sessionAssessments/[0-9]+/explanation(?:/[0-9]+/text)?)"))
                throw new IllegalArgumentException("INVALID_GROUNDED_PATCH_PATHS");
            fields.put(path,causeOnlyPaths.contains(path)?enumeration(List.of(UNKNOWN_CAUSE_TEXT)):string());
        }
        return obj(Map.of("patches",obj(fields)));
    }
    public static ObjectNode analysisReview(Collection<String> ids,Collection<String> sessions,JsonNode stations,Collection<Integer> baseline) {
        var evidence=M.createObjectNode().put("type","string");constrain(evidence,ids);
        var sessionIds=new TreeSet<String>();for(String s:sessions){if(!s.matches("S[1-9][0-9]{0,7}"))throw new IllegalArgumentException("INVALID_REVIEW_SESSION");sessionIds.add(s);}
        if(sessionIds.isEmpty()||sessionIds.size()>64||!stations.isArray()||stations.size()>256||baseline.size()>64)throw new IllegalArgumentException("INVALID_REVIEW_SOURCE_SCHEMA");
        var stationIds=new HashSet<String>();
        for(var row:stations) {
            if(!row.isObject()||!row.propertyNames().equals(Set.of("eventId","stationId","kind"))||!ids.contains(row.path("eventId").asString())||!stationIds.add(row.path("eventId").asString())
                ||!row.path("stationId").isString()||row.path("stationId").asString().length()>80||!row.path("kind").isString()||row.path("kind").asString().length()>80)throw new IllegalArgumentException("INVALID_REVIEW_STATION_SCHEMA");
        }
        var cite=obj(Map.of("text",prose(),"evidenceEventIds",array(ref(),1,30)));
        var interpretation=obj(Map.of("text",prose(),"evidenceEventIds",array(ref(),0,30)));
        var finding=obj(new LinkedHashMap<>(Map.of("id",string(),"skill",string(),"observation",array(cite,1,30),"interpretation",array(interpretation,1,12),"alternativeExplanations",array(cite,0,8),"suggestedSupport",string())));
        var nullable=M.createObjectNode();nullable.set("type",M.valueToTree(List.of("integer","null")));var values=nullable.putArray("enum");values.addNull();new TreeSet<>(baseline).forEach(values::add);
        var rationale=obj(Map.of("observed",array(obj(Map.of("findingId",string(),"observationIndex",integer(0,29))),1,6),"unknownCauseIndexes",array(integer(0,1000),0,5),"proposedPractice",string(),"baselineDifficulty",nullable,"supportCapabilities",array(enumeration(List.of("TEXT_GUIDANCE","ITEM_QUANTITY_BUDGET","TIME_LIMIT","SHELF_CATEGORY_ORDER")),1,4)));
        var plan=obj(Map.ofEntries(Map.entry("targetFindingIds",array(string(),0,12)),Map.entry("goal",string()),Map.entry("rationale",rationale),Map.entry("recommendedDifficulty",integer(1,3)),Map.entry("itemCount",integer(1,4)),Map.entry("quantityComplexity",levels()),Map.entry("budgetPressure",levels()),Map.entry("textSupport",enumeration(List.of("SIMPLIFIED","STANDARD","REDUCED"))),Map.entry("reasonCodes",array(string(),1,8))));
        var assessment=obj(Map.of("sessionId",enumeration(sessionIds),"judgment",enumeration(List.of("SUCCESS","FAILURE","UNDETERMINED")),"explanation",array(cite,1,12)));
        var analysis=obj(Map.of("sessionAssessments",array(assessment,sessionIds.size(),sessionIds.size()),"summary",array(cite,1,12),"findings",array(finding,0,12),"uncertainties",array(string(),0,1000),"practicePlan",plan,"usedEvidenceCardIds",array(string(),0,0)));
        var status=obj(Map.of("status",enumeration(List.of("MET","UNMET","UNKNOWN")),"evidenceEventIds",array(ref(),0,30)));
        var objective=obj(Map.of("productId",string(),"status",enumeration(List.of("MET","UNMET","UNKNOWN")),"evidenceEventIds",array(ref(),0,30)));
        var check=obj(Map.of("sessionId",enumeration(sessionIds),"objectives",array(objective,0,64),"budget",status,"submission",status));
        var stationConstant=M.createObjectNode().put("type","array");stationConstant.set("const",stations.deepCopy());
        var root=obj(Map.of("reviewFormat",M.createObjectNode().put("const","claim-evidence-v4"),"analysis",analysis,"reviewNotes",array(string(),0,20),"taskChecks",array(check,sessionIds.size(),sessionIds.size()),"stationClaims",stationConstant));
        root.putObject("$defs").set("evidenceId",evidence);return root;
    }
    public static ObjectNode compactAnalysisReview(Collection<String> ids,Collection<String> sessions,JsonNode stations,Collection<Integer> baseline) {
        var result=analysisReview(ids,sessions,stations,baseline);
        var props=(ObjectNode)result.path("properties");props.remove("stationClaims");
        props.set("reviewFormat",M.createObjectNode().put("const","claim-evidence-v5-source-lookups"));
        reorder(result,List.of("reviewFormat","taskChecks","analysis","reviewNotes"));
        reorder((ObjectNode)props.path("analysis"),List.of("sessionAssessments","summary","findings","uncertainties","practicePlan","usedEvidenceCardIds"));
        var finding=(ObjectNode)props.path("analysis").path("properties").path("findings").path("items");
        reorder(finding,List.of("id","skill","observation","interpretation","alternativeExplanations","suggestedSupport"));
        return result;
    }
    private static void reorder(ObjectNode schema,List<String> keys) {
        var old=schema.path("properties");var ordered=M.createObjectNode();for(String key:keys)ordered.set(key,old.path(key));
        schema.set("properties",ordered);schema.set("required",M.valueToTree(keys));
    }
    public static ObjectNode userProfile(Collection<String> ids,Collection<String> cards) {
        var unique=new TreeSet<String>();for(String id:ids){if(!id.matches("R[1-9][0-9]{0,7}"))throw new IllegalArgumentException("INVALID_PROFILE_SCHEMA_ID");unique.add(id);}
        if(unique.size()>4096||cards.size()>32)throw new IllegalArgumentException("PROFILE_SCHEMA_LIMIT");
        for(String card:cards)if(!card.matches("[A-Za-z0-9_-]{1,120}"))throw new IllegalArgumentException("INVALID_PROFILE_SCHEMA_CARD");
        var evidence=unique.isEmpty()?string():enumeration(unique);
        var finding=obj(Map.of("id",string(),"skill",string(),"observation",string(),"interpretation",string(),"alternativeExplanations",array(string(),0,8),"evidenceEventIds",array(evidence,1,30),"suggestedSupport",string()));
        var plan=obj(Map.ofEntries(Map.entry("targetFindingIds",array(string(),0,12)),Map.entry("goal",string()),Map.entry("rationale",string()),Map.entry("recommendedDifficulty",integer(1,3)),Map.entry("itemCount",integer(1,4)),Map.entry("quantityComplexity",levels()),Map.entry("budgetPressure",levels()),Map.entry("textSupport",enumeration(List.of("SIMPLIFIED","STANDARD","REDUCED"))),Map.entry("reasonCodes",array(string(),1,8))));
        var result=obj(Map.of("summary",string(),"findings",array(finding,0,unique.isEmpty()?0:12),"uncertainties",array(string(),0,20),"practicePlan",plan,"usedEvidenceCardIds",array(cards.isEmpty()?string():enumeration(new TreeSet<>(cards)),0,Math.min(8,cards.size()))));
        reorder(result,List.of("summary","findings","uncertainties","practicePlan","usedEvidenceCardIds"));return result;
    }
    private static ObjectNode string(){return M.createObjectNode().put("type","string").put("minLength",1);}
    // Inline annotations remain checked by the existing claim parser, not a runtime regex grammar.
    private static ObjectNode prose(){return string();}
    private static ObjectNode enumeration(Collection<String> values){var n=string();n.set("enum",M.valueToTree(values));return n;}
    private static ObjectNode levels(){return enumeration(List.of("LOW","MEDIUM","HIGH"));}
    private static ObjectNode integer(int min,int max){return M.createObjectNode().put("type","integer").put("minimum",min).put("maximum",max);}
    private static ObjectNode ref(){return M.createObjectNode().put("$ref","#/$defs/evidenceId");}
    private static ObjectNode array(JsonNode item,int min,int max){var n=M.createObjectNode().put("type","array").put("minItems",min).put("maxItems",max);n.set("items",item);return n;}
    private static ObjectNode obj(Map<String,? extends JsonNode> fields){var n=M.createObjectNode().put("type","object").put("additionalProperties",false);var p=n.putObject("properties");new TreeMap<>(fields).forEach(p::set);n.set("required",M.valueToTree(p.propertyNames()));return n;}
    public static ObjectNode digest(Collection<String> ids) {
        ObjectNode result=(ObjectNode)M.valueToTree(ObservationOutputSchema.VALUE);
        constrain((ObjectNode)result.at(DIGEST),ids);
        ((ObjectNode)result.path("properties").path("requestedSegmentIds")).put("maxItems",0);
        if(ids.isEmpty())((ObjectNode)result.path("properties").path("observations")).put("maxItems",0);
        return result;
    }
    private static ObjectNode adaptiveBase() {
        var properties=M.createObjectNode();
        for(String k:List.of("behaviorObservation","movementObservation","nextObservationQuestion"))
            properties.putObject(k).put("type","string").put("minLength",1);
        for(String k:List.of("alternativeExplanations","unknowns")) {
            var a=properties.putObject(k).put("type","array").put("minItems",0).put("maxItems",12);
            a.putObject("items").put("type","string");
        }
        var a=properties.putObject("evidenceIds").put("type","array").put("minItems",1).put("maxItems",12);
        a.putObject("items").put("type","string").put("pattern","^E[1-9][0-9]*$");
        var root=M.createObjectNode().put("type","object").put("additionalProperties",false);
        root.set("properties",properties);root.set("required",M.valueToTree(properties.propertyNames()));return root;
    }
    public static ObjectNode adaptive(Collection<String> ids) {
        var root=adaptiveBase();constrain((ObjectNode)root.at(ADAPTIVE),ids);return root;
    }
    public static ObjectNode questReview(Collection<String> ids) {
        var root=M.createObjectNode().put("type","object").put("additionalProperties",false);
        var p=root.putObject("properties");p.putObject("verdict").put("type","string").set("enum",M.valueToTree(List.of("VALID","REPAIR")));
        var checked=p.putObject("checked").put("type","array").put("minItems",5).put("maxItems",5);
        checked.putObject("items").put("type","string").set("enum",M.valueToTree(List.of("BEHAVIOR","MOVEMENT","DELIVERY","COMPLETION","SUPPORT")));
        var issue=p.putObject("issues").put("type","array").put("maxItems",4).putObject("items").put("type","object").put("additionalProperties",false);
        var ip=issue.putObject("properties");ip.putObject("path").put("type","string").set("enum",M.valueToTree(QUEST_REVIEW_PATHS));
        ip.putObject("explanation").put("type","string").put("minLength",1).put("maxLength",400);
        var cites=ip.putObject("sourceEvidenceIds").put("type","array").put("maxItems",6).putObject("items").put("type","string");constrain(cites,ids);
        issue.set("required",M.valueToTree(ip.propertyNames()));
        var progression=p.putObject("progressionCheck").put("type","object").put("additionalProperties",false);var pp=progression.putObject("properties");
        pp.putObject("sameMechanics").put("type","boolean");pp.putObject("questionImplemented").put("type","boolean");
        pp.putObject("supportChange").put("type","string").set("enum",M.valueToTree(List.of("INCREASED","REDUCED","UNCHANGED","UNDETERMINED")));
        pp.putObject("explanation").put("type","string").put("minLength",1).put("maxLength",250);progression.set("required",M.valueToTree(pp.propertyNames()));
        root.set("required",M.valueToTree(p.propertyNames()));return root;
    }
    private static void constrain(ObjectNode field,Collection<String> ids) {
        var sorted=new TreeSet<String>(Comparator.comparingInt(s->Integer.parseInt(s.substring(1))));
        for(String id:ids) {if(!id.matches("E[1-9][0-9]{0,7}"))throw new IllegalArgumentException("INVALID_SOURCE_SCHEMA_ID");sorted.add(id);}
        if(sorted.size()>4096)throw new IllegalArgumentException("SOURCE_SCHEMA_ID_LIMIT");
        if(!sorted.isEmpty())field.set("enum",M.valueToTree(sorted));
    }
    public static ObjectNode citationPoolRepair(Collection<String> ids,String path,List<String> identity,List<Integer> counts) {
        if(!path.matches("/analysis/findings/(0|[1-9][0-9]*)")||path.length()>40||identity.size()!=3||counts.size()!=3)throw new IllegalArgumentException("INVALID_CITATION_REPAIR_SCHEMA");
        for(String text:identity)if(text.isBlank()||text.length()>8000)throw new IllegalArgumentException("INVALID_CITATION_REPAIR_SCHEMA");
        for(int count:counts)if(count<0||count>30)throw new IllegalArgumentException("INVALID_CITATION_REPAIR_SCHEMA");
        if(ids.isEmpty())throw new IllegalArgumentException("INVALID_CITATION_REPAIR_SCHEMA");
        var evidence=string();constrain(evidence,ids);
        var fields=new LinkedHashMap<String,JsonNode>();int index=0;
        for(String key:List.of("id","skill","suggestedSupport"))fields.put(key,M.createObjectNode().put("type","string").put("const",identity.get(index++)));
        var clause=obj(Map.of("text",string(),"evidenceIndexes",array(integer(0,29),1,30)));index=0;
        for(String key:List.of("observation","interpretation","alternativeExplanations")){int count=counts.get(index++);fields.put(key,array(clause,count,count));}
        var pool=array(evidence,1,30);pool.put("uniqueItems",true);
        var patch=obj(Map.of("path",M.createObjectNode().put("type","string").put("const",path),"value",obj(fields)));
        var result=obj(Map.of("citationPool",pool,"patches",array(patch,1,1)));
        reorder(result,List.of("citationPool","patches"));return result;
    }
    public static boolean allowed(JsonNode schema) {
        boolean review=schema.path("properties").has("analysis");String prefix=review?"/properties/analysis/properties":"/properties";
        String sectionPath=prefix+"/practicePlan/properties/rationale"+(review?"/properties/proposedPractice":"");
        if(schema.at(sectionPath).path("properties").has("change")) {
            try {
            if(!practiceSections().equals(schema.at(sectionPath))||!(schema instanceof ObjectNode))return false;
            var base=((ObjectNode)schema).deepCopy();((ObjectNode)base.at(sectionPath.substring(0,sectionPath.lastIndexOf('/')))).set(sectionPath.substring(sectionPath.lastIndexOf('/')+1),string());
            var alternatives=(ObjectNode)base.at(prefix+"/findings/items/properties/alternativeExplanations");
            int max=alternatives.path("maxItems").asInt(-1);if(max!=0&&max!=8)return false;alternatives.put("maxItems",8);
            return allowed(base);
            }catch(RuntimeException malformed){return false;}
        }
        if(schema.path("properties").has("patches")) {
            try {var properties=schema.at("/properties/patches/properties");var causeOnly=new ArrayList<String>();for(String key:properties.propertyNames())if(properties.path(key).has("enum"))causeOnly.add(key);return schema.equals(groundedTextPatch(properties.propertyNames(),causeOnly));}
            catch(RuntimeException invalid){return false;}
        }
        if(schema.path("properties").has("citationPool")) {
            try {
                var ids=new ArrayList<String>();for(var id:schema.at("/properties/citationPool/items/enum")){if(!id.isString())return false;ids.add(id.asString());}
                String path=schema.at("/properties/patches/items/properties/path/const").asString();
                var value=schema.at("/properties/patches/items/properties/value/properties");
                var identity=new ArrayList<String>();for(String field:List.of("id","skill","suggestedSupport"))identity.add(value.path(field).path("const").asString());
                var counts=new ArrayList<Integer>();for(String field:List.of("observation","interpretation","alternativeExplanations")){var n=value.path(field).path("minItems");if(!n.isIntegralNumber())return false;counts.add(n.asInt());}
                return schema.equals(citationPoolRepair(ids,path,identity,counts));
            }catch(RuntimeException malformed){return false;}
        }

        if(schema.at("/properties/reviewFormat/const").asString().equals("claim-evidence-v5-source-lookups")) {
            try {
                var ids=schema.at("/$defs/evidenceId/enum");var sessions=schema.at("/properties/analysis/properties/sessionAssessments/items/properties/sessionId/enum");
                var bases=schema.at("/properties/analysis/properties/practicePlan/properties/rationale/properties/baselineDifficulty/enum");
                if(!ids.isArray()||!sessions.isArray()||!bases.isArray()||!bases.path(0).isNull())return false;
                var names=new ArrayList<String>();ids.forEach(x->names.add(x.asString()));var aliases=new ArrayList<String>();sessions.forEach(x->aliases.add(x.asString()));
                var ints=new ArrayList<Integer>();for(int i=1;i<bases.size();i++){if(!bases.get(i).isIntegralNumber())return false;ints.add(bases.get(i).asInt());}
                return schema.equals(compactAnalysisReview(names,aliases,M.createArrayNode(),ints));
            }catch(RuntimeException malformed){return false;}
        }
        if(schema.at("/properties/findings/items/properties/suggestedSupport").isObject()) {
            try {
                var ids=new ArrayList<String>();var cards=new ArrayList<String>();
                schema.at("/properties/findings/items/properties/evidenceEventIds/items/enum").forEach(x->ids.add(x.asString()));
                schema.at("/properties/usedEvidenceCardIds/items/enum").forEach(x->cards.add(x.asString()));
                return schema.equals(userProfile(ids,cards));
            }catch(RuntimeException malformed){return false;}
        }
        if(schema.has("$defs")) {
            try {
                var ids=schema.at("/$defs/evidenceId/enum");var sessions=schema.at("/properties/analysis/properties/sessionAssessments/items/properties/sessionId/enum");
                var baselines=schema.at("/properties/analysis/properties/practicePlan/properties/rationale/properties/baselineDifficulty/enum");
                if(!ids.isArray()||ids.isEmpty()||!sessions.isArray()||!baselines.isArray()||!baselines.get(0).isNull())return false;
                var names=new ArrayList<String>();ids.forEach(id->{if(!id.isString())throw new IllegalArgumentException();names.add(id.asString());});
                var aliases=new ArrayList<String>();sessions.forEach(s->{if(!s.isString())throw new IllegalArgumentException();aliases.add(s.asString());});
                var integers=new ArrayList<Integer>();for(int i=1;i<baselines.size();i++){var b=baselines.get(i);if(!b.isIntegralNumber()||!b.canConvertToInt())return false;integers.add(b.asInt());}
                return schema.equals(analysisReview(names,aliases,schema.at("/properties/stationClaims/const"),integers));
            }catch(RuntimeException malformed){return false;}
        }
        if(schema.equals(digest(List.of()))||schema.equals(M.valueToTree(ObservationOutputSchema.VALUE))||schema.equals(M.valueToTree(ObservationOutputSchema.LEGACY_VALUE)))return true;
        for(String path:List.of(DIGEST,ADAPTIVE,QUEST_REVIEW)) {
            if(!(schema.at(path) instanceof ObjectNode ref))continue;
            var ids=ref.path("enum");if(!ids.isArray()||ids.isEmpty()||ids.size()>4096)continue;
            var names=new ArrayList<String>();boolean valid=true;
            for(var id:ids) {if(!id.isString()||!id.asString().matches("E[1-9][0-9]{0,7}")){valid=false;break;}names.add(id.asString());}
            if(!valid)continue;
            if(schema.equals(path.equals(DIGEST)?digest(names):path.equals(ADAPTIVE)?adaptive(names):questReview(names)))return true;
        }
        return false;
    }
}
