package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Every recorded event remains addressable. Repeated payload values are shared, never inferred. */
public final class AdaptiveQuestEvidence {
    private AdaptiveQuestEvidence() {}
    public static ObjectNode build(ObjectMapper mapper, BehaviorAnalysisInput input) {
        var root = mapper.createObjectNode();
        root.put("datasetId", input.datasetId().toString());
        root.put("scope", "Every event has an ordered reference. Original interaction and timer values are in sourceEventDetails; geometry and navigation transitions are in navigationContext; every raw position sample and movementSpan is in events.payload. No coordinates or sample times are rounded. Full original datasets remain immutable; collection metadata and decorative product sprites are not repeated. E aliases map to original events. Raw coordinates are samples, not separate collisions. A return may serve a purchase, help or correction. Initial geometry does not prove later visibility or dynamic obstruction. No diagnosis or unobserved intent inference.");
        root.set("eventColumns", mapper.valueToTree(List.of("id","sessionId","sourceEventId","timeMs","eventCode","payload")));
        var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
        root.set("navigationContext",MovementSourceContext.build(mapper,response));
        root.set("sourceEventDetails",SourceEventDetails.build(mapper,response));
        var tasks=root.putArray("recordedTasks");
        var events=root.putArray("events");int index=0;
        for(var session:input.sessions())for(var event:session.events()) {
            var node=mapper.valueToTree(event);var original=node.path("payload");
            String code=node.path("action").path("eventCode").asString();
            var payload=mapper.createObjectNode();
            if(code.equals("SHOP.MOVEMENT_SAMPLED")) {
                for(String field:List.of("x","y","blocked","controlMode"))if(original.hasNonNull(field))payload.set(field,original.get(field));
                if(original.path("marketContent").hasNonNull("movementSpan"))payload.set("movementSpan",original.path("marketContent").get("movementSpan"));
            }
            // Automatic navigation values are in navigationContext; interactions and timing in sourceEventDetails.
            // Preserve changing support/input provenance independently of event labels.
            for(String field:List.of("support","error","safety","validity"))if(node.hasNonNull(field))payload.set("recorded_"+field,prune(mapper,node.get(field)));
            var mission=original.path("marketContent").path("sceneSnapshot").path("mission");
            if(mission.isObject()) {
                var task=tasks.addObject().put("sourceEventId",event.behaviorLogId().toString());task.set("mission",mission);
                task.set("actualConditions",actualConditions(mapper,original.path("marketContent").path("sceneSnapshot")));
            }
            index++;
            if(code.equals("SHOP.MOVEMENT_SAMPLED") || !payload.isEmpty())events.addArray().add("E"+index).add(session.sessionId().toString()).add(event.behaviorLogId().toString())
                .add(event.elapsedFromSessionStartMs()).add(code).add(payload);
        }
        root.put("eventCount",index);
        AnalysisSourceContext.addMissionPlanProvenance(mapper,root);
        var refs=new AnalysisReferences(mapper,response);
        // Use the same prior-AI boundary as analysis/profile generation. Delivered
        // goals, guidance, mechanics and every original action/position stay intact.
        var grounded=PriorAiPlanText.withhold(mapper,root);
        return (ObjectNode)mapper.readTree(refs.encode(mapper.writeValueAsString(grounded),false));
    }
    /** Separate literal projection; never rewrite the authored mission or invent missing settings. */
    static ObjectNode actualConditions(ObjectMapper mapper,JsonNode scene) {
        var out=mapper.createObjectNode();var starting=scene.path("startingConditions");var runtime=starting.path("runtimeConfig");
        var geometry=starting.path("geometry");
        if(geometry.isString())try{geometry=mapper.readTree(geometry.asString());}catch(RuntimeException ignored){geometry=mapper.nullNode();}
        var settings=geometry.path("config");var plan=out.putObject("runtimePlan");
        if(settings.isObject()) {
            var environment=plan.putObject("environment");
            for(String field:List.of("layoutId","employeeCount","customerCount","pillarCount","chairCount","cashierCount","kioskLane","entranceConstruction"))
                if(settings.has(field))environment.set(field,settings.get(field).deepCopy());
            if(settings.path("shelfOrder").isArray())out.putObject("environmentPlan").set("shelfOrder",settings.get("shelfOrder").deepCopy());
        }
        for(String field:List.of("stockPerProduct","alarmPenaltyPoints","wrongWayPenaltyPoints","cashierRequestPenaltyPoints"))
            if(runtime.has(field))plan.set(field,runtime.get(field).deepCopy());
        if(runtime.path("difficulty").isString())plan.set("matchRule",runtime.get("difficulty").deepCopy());
        if(runtime.path("learning").isObject()) {
            var learning=plan.putObject("learning");
            for(String field:List.of("stockoutProductId","allowSubstitution","budgetChoiceEnabled","choiceBudget","checkoutReviewMode"))
                if(runtime.path("learning").has(field))learning.set(field,runtime.path("learning").get(field).deepCopy());
        }
        if(runtime.path("initialStock").isObject()&&runtime.path("stockPerProduct").isIntegralNumber()) {
            var overrides=plan.putObject("stockOverrides");
            for(String id:runtime.path("initialStock").propertyNames())if(!runtime.path("initialStock").get(id).equals(runtime.get("stockPerProduct")))overrides.set(id,runtime.path("initialStock").get(id));
        }
        return out;
    }
    public static ObjectNode encode(ObjectMapper mapper,ObjectNode source) {
        var codec=new FinalSourceEncoding(mapper,true);var plain=codec.encode(source);
        var alternative=source.deepCopy();var values=new ArrayList<JsonNode>();source.path("events").forEach(values::add);
        alternative.set("events",new LosslessEventColumns(mapper).encodeValues(values));
        alternative.put("eventColumnEncoding","events.count/data expands original event rows in order: same=common literal, values=per-row, fields=field columns plus rest, dictionary/refs=zero-based original values, groups/positions=original row positions, items=array-position columns, prefix/suffixes=exact string concatenation. Every number, row and order is unchanged.");
        var packed=codec.encode(alternative);
        return QwenTokenCounter.count(packed.toString())<QwenTokenCounter.count(plain.toString())?packed:plain;
    }
    public static ObjectNode decodeObservation(ObjectMapper mapper,JsonNode source) {
        var decoded=source.has("adaptiveTransportVersion")?AdaptiveQuestTransport.decode(mapper,source):new FinalSourceEncoding(mapper).decode(source);
        if(decoded.has("eventColumnEncoding"))decoded.set("events",new LosslessEventColumns(mapper).decodeValues(decoded.path("events")));
        return decoded;
    }
    private static JsonNode prune(ObjectMapper mapper,JsonNode source) {
        if(source.isObject()) {
            var result=mapper.createObjectNode();
            for(String key:source.propertyNames()) if(!source.get(key).isNull()) result.set(key,prune(mapper,source.get(key)));
            return result;
        }
        if(source.isArray()) {var a=mapper.createArrayNode();for(var value:source)a.add(prune(mapper,value));return a;}
        return source.deepCopy();
    }
    public static Set<String> ids(JsonNode source,boolean movementOnly) {
        var result=new HashSet<String>();
        for(var row:source.path("events")) {
            String code=row.path(4).asString();
            if(!movementOnly || code.contains("MOVEMENT") || code.contains("SHELF") || code.contains("ROUTE")
                    || code.contains("PROXIMITY") || code.contains("TARGET") || code.contains("AISLE")) result.add(row.path(0).asString());
        }
        for(var row:source.path("sourceEventDetails"))if(!movementOnly || row.path("eventCode").asString().contains("SHELF"))result.add(row.path("id").asString());
        for(var session:source.path("navigationContext").path("sessions")){
            for(var row:session.path("movementEventDetails"))result.add(row.path("id").asString());
            for(String field:List.of("sceneSources","collectorContexts"))for(var row:session.path(field))result.add(row.path("sourceEventId").asString());
        }
        return result;
    }
}
