package oneuldo.behaviorlog.analysis.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Select a reversible wire representation using the model tokenizer, not byte counts. */
public final class MovementInputEncoder {
    public static final String VERSION = "movement-wire-v1";
    private final ObjectMapper mapper;
    public MovementInputEncoder(ObjectMapper mapper) { this.mapper = mapper; }

    public ObjectNode encode(ObjectNode source) {
        var tables = new LosslessTables(mapper);
        ObjectNode root = (ObjectNode) tables.decode(source);
        var timeline = root.path("behaviorTimeline");
        if (!CompactBehaviorTimeline.FORMAT.equals(timeline.path("encoding").asString())) return source;
        var expanded = new CompactBehaviorTimeline(mapper).decodeExpanded(timeline);
        ObjectNode candidate = root.deepCopy();
        candidate.set("behaviorTimeline", new LosslessEventColumns(mapper).encode(expanded));
        ObjectNode packed = (ObjectNode) tables.encode(candidate);
        ObjectNode best=QwenTokenCounter.count(packed.toString()) < QwenTokenCounter.count(source.toString()) ? packed : source;
        candidate.set("behaviorTimeline",new GroupedEventInput(mapper).encode(expanded));
        ObjectNode grouped=(ObjectNode)tables.encode(candidate);
        return QwenTokenCounter.count(grouped.toString()) < QwenTokenCounter.count(best.toString()) ? grouped : best;
    }
}
