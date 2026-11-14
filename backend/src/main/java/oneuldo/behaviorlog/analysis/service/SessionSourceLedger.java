package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Literal event census and source anchors. No outcome, stage/ability score or recommended practice. */
public final class SessionSourceLedger {
    public static final String FIELD = "sessionSourceLedger";
    public static final String RULE = """
        Ledger counts are scoped recorded events, never ability or unobserved actions: check integrity/coverage before absence claims.
        Cart/help opening is not product addition/understanding; zero generic help is not briefing reading.
        No submission supplies no submission intent; non-expired is not timeout. Synthetic provenance is known, human ability unknown; separate owners.
        Compare SAME-session goals, not history/distractors; changed goals are future proposals.
        Preserve partial steps and reached-then-left quantities despite empty final cart. Cross-check summary/findings/uncertainties/plan rationale.
        Samples do not guarantee a continuous reconstructed route. Ledger anchors grant no extra citations; original events prevail.
        Use partial evidence for the next unanswered action, support and observable outcome; no automatic item/layout/difficulty change or mere goal copying.
        """;
    private static final Set<String> FOCUS = Set.of("SHOP.SHELF_OPENED", "SHOP.QUANTITY_CHANGED", "SHOP.ITEM_SELECTED",
            "SHOP.CART_OPENED", "SHOP.CART_CLOSED", "SHOP.GENERAL_HELP_OPENED", "SHOP.STAFF_HELP_REQUESTED", "SHOP.CHECKOUT_SUBMITTED");
    private SessionSourceLedger() {}
    public static ArrayNode build(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        return build(mapper, mapper.valueToTree(input.input()));
    }
    public static ArrayNode build(ObjectMapper mapper, JsonNode input) {
        var result = mapper.createArrayNode();
        for (var session : input.path("sessions")) {
            var row = result.addObject();
            copy(session, row, "sessionId", "integrity", "startedAt", "endedAt");
            row.put("providedEventCount", session.path("events").size());
            var counts = row.putObject("eventCounts");
            var owners = row.putObject("countsByRecordedOwner");
            var anchors = row.putObject("eventAnchors");
            var requirements = row.putArray("requirements");
            var contexts = row.putArray("executionContextChanges");
            var terminals = row.putArray("terminalRecords");
            var quantities = row.putObject("quantityRanges");
            var movement = row.putObject("recordedMovement").put("coordinateSampleCount",0);
            String owner = "UNRECORDED";
            for (String code : new TreeSet<>(FOCUS)) counts.put(code, 0);
            for (var event : session.path("events")) {
                String code = event.path("action").path("eventCode").asString("");
                var payload = event.path("payload");
                var content = payload.path("marketContent");
                var context = content.path("replayExecutionContext");
                if ("SHOP.MOVEMENT_SAMPLED".equals(code) && payload.path("x").isNumber() && payload.path("y").isNumber()) {
                    movement.put("coordinateSampleCount",movement.path("coordinateSampleCount").asInt()+1);
                    var point=anchor(mapper,event);copy(payload,point,"x","y","blocked");
                    if(!movement.has("first"))movement.set("first",point);
                    movement.set("last",point);
                }
                if (context.path("executionOwner").isString()) owner = context.path("executionOwner").asString();
                if ("SHOP.REPLAY_CONTEXT_CHANGED".equals(code)) {
                    var a = anchor(mapper, event); copy(context,a,"source","executionOwner","controllerReason"); contexts.add(a);
                }
                if (FOCUS.contains(code)) {
                    counts.put(code, counts.path(code).asInt()+1);
                    var owned = owners.path(owner) instanceof ObjectNode o ? o : owners.putObject(owner);
                    owned.put(code, owned.path(code).asInt()+1);
                    var range = anchors.path(code) instanceof ObjectNode o ? o : anchors.putObject(code);
                    if (!range.has("first")) range.set("first", anchor(mapper,event));
                    range.set("last", anchor(mapper,event));
                }
                if ("SHOP.SESSION_STARTED".equals(code)) {
                    var mission = content.path("sceneSnapshot").path("mission");
                    var req = anchor(mapper,event);
                    copy(mission,req,"objectives","budget","timeLimitSeconds");
                    if (!req.has("objectives")) copy(payload,req,"objectives");
                    if (!req.has("budget") && payload.hasNonNull("budgetAmount")) req.set("budget",payload.get("budgetAmount"));
                    requirements.add(req);
                }
                if (Set.of("SHOP.SESSION_ENDED","SHOP.TIME_LIMIT_EXPIRED","SHOP.CHECKOUT_SUBMITTED").contains(code)) {
                    var a = anchor(mapper,event); a.put("eventCode",code); a.put("recordedOwner",owner);
                    copy(event,a,"sessionEnd"); copy(payload,a,"timing"); copy(content,a,"cart","objectiveProgress");
                    if (content.path("runtimeState").hasNonNull("paid")) a.set("paid",content.path("runtimeState").get("paid"));
                    terminals.add(a);
                }
                if ("SHOP.QUANTITY_CHANGED".equals(code) && payload.path("itemId").isString() && payload.path("quantityAfter").isNumber()) {
                    String item=payload.path("itemId").asString();
                    var q=quantities.path(item) instanceof ObjectNode o ? o : quantities.putObject(item);
                    double after=payload.path("quantityAfter").asDouble();
                    double before=payload.path("quantityBefore").isNumber()?payload.path("quantityBefore").asDouble():after;
                    q.put("count",q.path("count").asInt()+1);
                    q.put("min",Math.min(q.path("min").asDouble(after),Math.min(before,after)));
                    q.put("max",Math.max(q.path("max").asDouble(after),Math.max(before,after)));
                    var values=q.path("afterValueCounts") instanceof ObjectNode o?o:q.putObject("afterValueCounts");
                    String value=payload.path("quantityAfter").toString();values.put(value,values.path(value).asInt()+1);
                    if(!q.has("first"))q.set("first",anchor(mapper,event)); q.set("last",anchor(mapper,event));
                }
            }
        }
        return result;
    }
    private static ObjectNode anchor(ObjectMapper mapper,JsonNode event) {
        var row=mapper.createObjectNode();
        if(event.hasNonNull("behaviorLogId"))row.set("sourceEventId",event.get("behaviorLogId"));
        copy(event,row,"sequence");return row;
    }
    private static void copy(JsonNode from,ObjectNode to,String... fields) {
        for(String field:fields)if(from.hasNonNull(field))to.set(field,from.get(field).deepCopy());
    }
}
