package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Shares only repeated labels in consecutive readable quantity facts. IDs and numbers stay literal on each row. */
public final class ReadableQuantityRows {
    static final String MARKER="$quantityRows";
    static final String RULE="Blocks retain original event order. A table row is [eventId,sequence,quantityBefore,quantityAfter] exactly as columns names it; common contains unchanged original fields applying to every row. eventId is the original eventsById key, never a row index. fieldOrder restores the original field order. Other blocks are unchanged {eventId:original fields}. No arithmetic, numeric aliases, rounding or inferred values.";
    private static final List<String> VALUES=List.of("sequence","quantityBefore","quantityAfter");
    private static final List<String> COLUMNS=List.of("eventId","sequence","quantityBefore","quantityAfter");
    private ReadableQuantityRows() {}

    public static JsonNode encode(ObjectMapper m,JsonNode events) {
        if(!(events instanceof ObjectNode object)||object.size()<6)return events.deepCopy();
        var names=new ArrayList<>(object.propertyNames());var blocks=m.createArrayNode();boolean packed=false;
        for(int first=0;first<names.size();) {
            String id=names.get(first);var row=object.get(id);int end=first+1;
            if(eligible(id,row))while(end<names.size()&&eligible(names.get(end),object.get(names.get(end)))&&sameFields(row,object.get(names.get(end))))end++;
            if(end-first>=6) {
                var block=blocks.addObject();block.set("common",common(m,row));
                block.set("fieldOrder",m.valueToTree(row.propertyNames()));block.set("columns",m.valueToTree(COLUMNS));
                var rows=block.putArray("rows");
                for(int at=first;at<end;at++){var original=object.get(names.get(at));var values=rows.addArray().add(names.get(at));for(String field:VALUES)values.add(original.get(field).deepCopy());}
                packed=true;first=end;
            } else {blocks.addObject().set(id,row.deepCopy());first++;}
        }
        if(!packed)return events.deepCopy();
        var result=m.createObjectNode();result.set(MARKER,blocks);result.put("rule",RULE);
        return QwenTokenCounter.count(result.toString())<QwenTokenCounter.count(events.toString())?result:events.deepCopy();
    }
    private static boolean eligible(String id,JsonNode row) {
        return id.matches("E[1-9][0-9]*")&&row.isObject()&&row.path("eventCode").asString().equals("SHOP.QUANTITY_CHANGED")
            &&row.path("sequence").isIntegralNumber()&&row.path("quantityBefore").isNumber()&&row.path("quantityAfter").isNumber()
            &&row.valueStream().allMatch(JsonNode::isValueNode);
    }
    private static boolean sameFields(JsonNode a,JsonNode b) {
        if(!new ArrayList<>(a.propertyNames()).equals(new ArrayList<>(b.propertyNames())))return false;
        for(String field:a.propertyNames())if(!VALUES.contains(field)&&!a.get(field).equals(b.get(field)))return false;
        return true;
    }
    private static ObjectNode common(ObjectMapper m,JsonNode row){var result=m.createObjectNode();for(String field:row.propertyNames())if(!VALUES.contains(field))result.set(field,row.get(field).deepCopy());return result;}

    public static JsonNode decode(ObjectMapper m,JsonNode events) {
        if(!events.isObject()||!events.has(MARKER))return events.deepCopy();
        if(!events.propertyNames().equals(Set.of(MARKER,"rule"))||!RULE.equals(events.path("rule").asString())||!events.path(MARKER).isArray())throw invalid();
        var result=m.createObjectNode();
        for(var block:events.path(MARKER)) {
            if(!block.isObject())throw invalid();
            if(!block.has("rows")) {
                if(block.size()!=1)throw invalid();
                String id=block.propertyNames().iterator().next();if(result.has(id))throw invalid();result.set(id,block.get(id).deepCopy());continue;
            }
            if(!block.propertyNames().equals(Set.of("common","fieldOrder","columns","rows"))||!block.path("common").isObject()
                ||!block.path("fieldOrder").isArray()||!block.path("columns").equals(m.valueToTree(COLUMNS))||!block.path("rows").isArray())throw invalid();
            var fields=new LinkedHashSet<String>();for(var field:block.path("fieldOrder"))if(!field.isString()||!fields.add(field.asString()))throw invalid();
            var expected=new HashSet<>(block.path("common").propertyNames());if(!Collections.disjoint(expected,VALUES))throw invalid();expected.addAll(VALUES);
            if(!fields.equals(expected))throw invalid();
            for(var values:block.path("rows")) {
                if(!values.isArray()||values.size()!=4||!values.get(0).isString()||!values.get(1).isIntegralNumber()||!values.get(2).isNumber()||!values.get(3).isNumber())throw invalid();
                String id=values.get(0).asString();if(!id.matches("E[1-9][0-9]*")||result.has(id))throw invalid();
                var row=m.createObjectNode();for(String field:fields){int index=VALUES.indexOf(field);row.set(field,index<0?block.path("common").get(field).deepCopy():values.get(index+1).deepCopy());}
                if(!eligible(id,row))throw invalid();result.set(id,row);
            }
        }
        return result;
    }
    static ObjectNode restore(ObjectMapper m,ObjectNode source) {
        if(source.path(ReadableSourceFacts.FIELD) instanceof ObjectNode facts&&facts.has("eventsById"))facts.set("eventsById",decode(m,facts.get("eventsById")));
        return source;
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_READABLE_QUANTITY_ROWS");}
}
