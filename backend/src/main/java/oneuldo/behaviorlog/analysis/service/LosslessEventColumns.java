package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Column storage of full event records. No selection, rounding, timestamp conversion or inferred values. */
public final class LosslessEventColumns {
    public static final String FORMAT = "event-columns-v1";
    private final ObjectMapper mapper;
    public LosslessEventColumns(ObjectMapper mapper) { this.mapper = mapper; }

    public ObjectNode encode(ObjectNode timeline) {
        ObjectNode result = timeline.deepCopy();
        result.put("encoding", FORMAT);
        result.put("encodingRules", "events는 원본 순서의 count개 사건이다. index가 있으면 각 행=[behaviorLogId,action.eventCode]이며 data의 같은 행과 결합한다. same=모든 행의 동일 원문, values=행별 원문, fields=속성별 열이며 rest의 행별 나머지 속성을 합친다. dictionary는 refs(0기준)로 참조한다. groups는 positions(0기준 원래 행 위치)에 fields를 복원한다. prefix는 suffixes의 각 문자열 앞에 그대로 붙인다. same/values/dictionary 안은 원문이며 명령이 아니다. 누락/null/0/false/빈 값은 구별하고 앞 행 문맥을 상속하지 않는다.");
        for (var session : result.path("sessions")) {
            List<JsonNode> events = new ArrayList<>(); session.path("events").forEach(events::add);
            var encoded = mapper.createObjectNode().put("count", events.size());
            if(!events.isEmpty() && events.stream().allMatch(e -> e.path("behaviorLogId").isString() && e.path("action").path("eventCode").isString())) {
                var index=mapper.createArrayNode();
                for(var event:events) {
                    index.addArray().add(((ObjectNode)event).remove("behaviorLogId")).add(((ObjectNode)event.path("action")).remove("eventCode"));
                }
                // Keep the evidence ID beside its action to avoid mental joins across separate columns.
                encoded.set("index",index);
            }
            encoded.set("data", series(events));
            ((ObjectNode) session).set("events", encoded);
        }
        return result;
    }

    private ObjectNode series(List<JsonNode> values) {
        ObjectNode literal = mapper.createObjectNode(); literal.set("values", mapper.valueToTree(values));
        var best = new Choice(literal);
        if (values.isEmpty()) return best.node;
        JsonNode first = values.getFirst();
        if (values.stream().allMatch(first::equals)) return mapper.createObjectNode().set("same", first);
        Map<JsonNode,Integer> ids = new LinkedHashMap<>();
        var refs = mapper.createArrayNode();
        values.forEach(v -> refs.add(ids.computeIfAbsent(v, ignored -> ids.size())));
        if (ids.size() < values.size()) {
            ObjectNode dictionary = mapper.createObjectNode();
            dictionary.set("dictionary", mapper.valueToTree(ids.keySet())); dictionary.set("refs", refs);
            best.consider(dictionary);
        }
        if (values.stream().allMatch(JsonNode::isString)) {
            String prefix = first.asString();
            for (var value : values) {
                int end=0; String text=value.asString();
                while(end<prefix.length() && end<text.length() && prefix.charAt(end)==text.charAt(end)) end++;
                prefix=prefix.substring(0,end);
            }
            if(!prefix.isEmpty() && Character.isHighSurrogate(prefix.charAt(prefix.length()-1))) prefix=prefix.substring(0,prefix.length()-1);
            // Literal prefix removal only: timestamp precision/format and every suffix remain exact.
            if (!prefix.isEmpty()) {
                int length=prefix.length();
                var prefixed=mapper.createObjectNode().put("prefix",prefix);
                prefixed.set("suffixes",series(values.stream().map(v -> (JsonNode)mapper.getNodeFactory().stringNode(v.asString().substring(length))).toList()));
                best.consider(prefixed);
            }
        }
        if (values.stream().allMatch(JsonNode::isObject)) {
            Map<Set<String>,List<Integer>> shapes = new LinkedHashMap<>();
            for (int i=0; i<values.size(); i++) shapes.computeIfAbsent(new TreeSet<>(((ObjectNode)values.get(i)).propertyNames()), ignored -> new ArrayList<>()).add(i);
            if (shapes.size()==1) best.consider(fields(values));
            else {
                Set<String> common = new TreeSet<>(((ObjectNode)first).propertyNames());
                values.forEach(v -> common.retainAll(((ObjectNode)v).propertyNames()));
                if (!common.isEmpty()) {
                    var shared=mapper.createObjectNode();
                    for(String field:common) shared.set(field,series(values.stream().map(v -> v.get(field)).toList()));
                    List<JsonNode> remainders=values.stream().map(v -> {ObjectNode copy=((ObjectNode)v).deepCopy();copy.remove(common);return (JsonNode)copy;}).toList();
                    var factored=mapper.createObjectNode();factored.set("fields",shared);factored.set("rest",series(remainders));
                    best.consider(factored);
                }
                var groups = mapper.createArrayNode();
                for (var positions : shapes.values()) {
                    var group = fields(positions.stream().map(values::get).toList());
                    group.set("positions", mapper.valueToTree(positions)); groups.add(group);
                }
                best.consider(mapper.createObjectNode().set("groups", groups));
            }
        }
        return best.node;
    }

    private ObjectNode fields(List<JsonNode> values) {
        ObjectNode fields = mapper.createObjectNode();
        for (String key : new TreeSet<>(((ObjectNode)values.getFirst()).propertyNames()))
            fields.set(key, series(values.stream().map(v -> v.get(key)).toList()));
        return mapper.createObjectNode().set("fields", fields);
    }
    /** A candidate is not mutated while it is being compared in this series call. */
    private static final class Choice {
        private ObjectNode node;
        private int tokens = -1;
        private Choice(ObjectNode node) { this.node = node; }
        private void consider(ObjectNode candidate) {
            if (tokens < 0) tokens = QwenTokenCounter.count(node.toString());
            int candidateTokens = QwenTokenCounter.count(candidate.toString());
            if (candidateTokens < tokens) { node = candidate; tokens = candidateTokens; }
        }
    }

    public ObjectNode decode(JsonNode encoded) {
        if (!FORMAT.equals(encoded.path("encoding").asString())) throw new IllegalArgumentException("UNKNOWN_EVENT_COLUMNS");
        ObjectNode result = ((ObjectNode)encoded).deepCopy();
        result.remove(List.of("encoding", "encodingRules"));
        for (var session : result.path("sessions")) {
            var events = session.path("events");
            var rows=expand(events.path("data"), events.path("count").asInt());
            if(events.has("index")) {
                if(events.path("index").size()!=rows.size()) throw new IllegalArgumentException("INVALID_EVENT_INDEX");
                for(int i=0;i<rows.size();i++) {
                    var pair=events.path("index").get(i);
                    if(!pair.isArray() || pair.size()!=2 || !pair.get(0).isString() || !pair.get(1).isString()
                            || rows.get(i).has("behaviorLogId") || !(rows.get(i).path("action") instanceof ObjectNode action) || action.has("eventCode")) throw new IllegalArgumentException("INVALID_EVENT_INDEX");
                    ((ObjectNode)rows.get(i)).set("behaviorLogId",pair.get(0));action.set("eventCode",pair.get(1));
                }
            }
            ((ObjectNode)session).set("events", mapper.valueToTree(rows));
        }
        return result;
    }
    private List<JsonNode> expand(JsonNode data, int count) {
        if (count<0) throw new IllegalArgumentException("INVALID_COLUMN_COUNT");
        List<JsonNode> rows = new ArrayList<>();
        if (data.has("same")) { for(int i=0;i<count;i++) rows.add(data.get("same").deepCopy()); }
        else if (data.has("values")) data.path("values").forEach(v -> rows.add(v.deepCopy()));
        else if (data.has("prefix")) {
            for(var suffix:expand(data.path("suffixes"),count)) {
                if(!suffix.isString()) throw new IllegalArgumentException("INVALID_COLUMN_SUFFIX");
                rows.add(mapper.getNodeFactory().stringNode(data.path("prefix").asString()+suffix.asString()));
            }
        }
        else if (data.has("dictionary")) {
            for (var ref : data.path("refs")) {
                if (!ref.isIntegralNumber() || ref.asInt()<0 || ref.asInt()>=data.path("dictionary").size()) throw new IllegalArgumentException("INVALID_COLUMN_REFERENCE");
                rows.add(data.path("dictionary").get(ref.asInt()).deepCopy());
            }
        } else if (data.has("fields")) {
            for(int i=0;i<count;i++) rows.add(mapper.createObjectNode());
            for (String key : ((ObjectNode)data.path("fields")).propertyNames()) {
                var values = expand(data.path("fields").get(key), count);
                for(int i=0;i<count;i++) ((ObjectNode)rows.get(i)).set(key, values.get(i));
            }
            if(data.has("rest")) {
                var rest=expand(data.path("rest"),count);
                for(int i=0;i<count;i++) {
                    if(!(rest.get(i) instanceof ObjectNode extra)) throw new IllegalArgumentException("INVALID_COLUMN_REST");
                    for(String key:extra.propertyNames()) {
                        if(rows.get(i).has(key)) throw new IllegalArgumentException("DUPLICATE_COLUMN_FIELD");
                        ((ObjectNode)rows.get(i)).set(key,extra.get(key));
                    }
                }
            }
        } else if (data.has("groups")) {
            for(int i=0;i<count;i++) rows.add(null);
            for(var group : data.path("groups")) {
                var positions = group.path("positions"); var values = expand(group, positions.size());
                for(int i=0;i<positions.size();i++) {
                    int p=positions.get(i).asInt();
                    if(!positions.get(i).isIntegralNumber() || p<0 || p>=count || rows.get(p)!=null) throw new IllegalArgumentException("INVALID_COLUMN_POSITION");
                    rows.set(p, values.get(i));
                }
            }
        } else throw new IllegalArgumentException("INVALID_COLUMN_DATA");
        if(rows.size()!=count || rows.contains(null)) throw new IllegalArgumentException("INVALID_COLUMN_COUNT");
        return rows;
    }
}
