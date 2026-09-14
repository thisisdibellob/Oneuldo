package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Reversible grouping by event code. No event selection, rounding, scoring or behavioral inference. */
public final class GroupedEventInput {
    private final ObjectMapper mapper;
    public GroupedEventInput(ObjectMapper mapper) {this.mapper=mapper;}
    public ObjectNode encode(ObjectNode timeline) {
        ObjectNode result=timeline.deepCopy();
        result.put("encoding","event-groups-v1");
        result.put("encodingRules","session의 eventDefaults, group의 defaults, 각 rows 객체를 차례로 깊게 합치면 원본 사건이다. rows의 / 경로는 JSON Pointer 필드 경로다. positions는 원본 배열의 0부터 시작하는 위치이며, 서로 다른 group 사건은 positions 순으로 읽는다. 누락/null/0/false를 구별한다. 모든 사건·좌표·시각을 보존했다. group 분류는 사건 코드 묶음이며 행동 평가가 아니다.");
        for(var session:result.path("sessions")) {
            var all=new ArrayList<ObjectNode>(); session.path("events").forEach(e->all.add((ObjectNode)e));
            if(all.isEmpty())continue;
            var shared=common(all);((ObjectNode)session).set("eventDefaults",shared);
            var groups=new LinkedHashMap<String,List<ObjectNode>>();
            for(var event:session.path("events")) groups.computeIfAbsent(event.path("action").path("eventCode").asString(),ignored->new ArrayList<>()).add(subtract((ObjectNode)event,shared));
            var out=mapper.createArrayNode();
            for(var entry:groups.entrySet()) {
                var events=entry.getValue();
                var defaults=common(events);var g=out.addObject();g.set("defaults",defaults);
                var positions=g.putArray("positions");for(int i=0;i<all.size();i++)if(all.get(i).path("action").path("eventCode").asString().equals(entry.getKey()))positions.add(i);
                var rows=g.putArray("rows");for(var event:events) rows.add(flatten(subtract(event,defaults)));
            }
            ((ObjectNode)session).set("events",out);
        }
        return result;
    }
    private ObjectNode flatten(ObjectNode value) {
        var out=mapper.createObjectNode(); flattenInto(value,"",out); return out;
    }
    private void flattenInto(ObjectNode value,String prefix,ObjectNode out) {
        for(String key:value.propertyNames()) {
            var path=prefix+"/"+key.replace("~","~0").replace("/","~1");
            if(value.get(key).isObject()&&!value.get(key).isEmpty())flattenInto((ObjectNode)value.get(key),path,out);
            else out.set(path,value.get(key));
        }
    }
    private ObjectNode unflatten(ObjectNode value) {
        var out=mapper.createObjectNode();
        for(String path:value.propertyNames()) {
            String[] keys=path.substring(1).split("/",-1);var target=out;
            for(int i=0;i<keys.length;i++) {
                var key=keys[i].replace("~1","/").replace("~0","~");
                if(i==keys.length-1)target.set(key,value.get(path).deepCopy());
                else {if(!target.has(key))target.putObject(key);target=(ObjectNode)target.get(key);}
            }
        }
        return out;
    }
    private ObjectNode common(List<ObjectNode> rows) {
        var result=mapper.createObjectNode();
        for(String key:rows.getFirst().propertyNames()) {
            if(rows.stream().anyMatch(r->!r.has(key)))continue;
            var first=rows.getFirst().get(key);
            if(rows.stream().allMatch(r->r.get(key).equals(first)))result.set(key,first.deepCopy());
            else if(rows.stream().allMatch(r->r.get(key).isObject())) {
                var nested=common(rows.stream().map(r->(ObjectNode)r.get(key)).toList());
                if(!nested.isEmpty())result.set(key,nested);
            }
        }
        return result;
    }
    private ObjectNode subtract(ObjectNode row,ObjectNode defaults) {
        var result=row.deepCopy();
        for(String key:defaults.propertyNames()) {
            if(defaults.get(key).equals(result.get(key)))result.remove(key);
            else result.set(key,subtract((ObjectNode)result.get(key),(ObjectNode)defaults.get(key)));
        }
        return result;
    }
    public ObjectNode decode(ObjectNode timeline) {
        var result=timeline.deepCopy();result.remove(List.of("encoding","encodingRules"));
        for(var session:result.path("sessions")) {
            var ordered=new TreeMap<Integer,ObjectNode>();
            for(var group:session.path("events"))for(int i=0;i<group.path("rows").size();i++) {
                var row=(ObjectNode)group.path("rows").get(i);
                ordered.put(group.path("positions").get(i).asInt(),merge((ObjectNode)session.path("eventDefaults"),merge((ObjectNode)group.path("defaults"),unflatten(row))));
            }
            var rows=new ArrayList<>(ordered.values());
            ((ObjectNode)session).set("events",mapper.valueToTree(rows));
            ((ObjectNode)session).remove("eventDefaults");
        }
        return result;
    }
    private ObjectNode merge(ObjectNode defaults,ObjectNode row) {
        var result=defaults.deepCopy();
        for(String key:row.propertyNames()) {
            if(result.path(key).isObject()&&row.path(key).isObject())result.set(key,merge((ObjectNode)result.get(key),(ObjectNode)row.get(key)));
            else result.set(key,row.get(key).deepCopy());
        }
        return result;
    }
}
