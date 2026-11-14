package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import oneuldo.behaviorlog.personalization.service.AdaptiveNumericColumnText;
import oneuldo.behaviorlog.personalization.service.AdaptiveNumericFragments;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Exact post-alias source transport. No event selection, arithmetic or coordinate rounding. */
public final class ObservationWireEncoding {
    public static final String VERSION="observation-wire-v1-exact-numbers";
    private static final String FIELD="observationWireEncoding";
    private ObservationWireEncoding() {}
    public static ObjectNode encode(ObjectMapper mapper,ObjectNode legacy) {
        var source=(ObjectNode)new LosslessTables(mapper).decode(legacy);
        if(List.of(FIELD,ExactNumericDeltas.FIELD,AdaptiveNumericColumnText.RULE_FIELD,AdaptiveNumericFragments.FIELD,
                AdaptiveNumericFragments.RULE_FIELD,AdaptiveNumericFragments.SUFFIX_FIELD).stream().anyMatch(source::has))return legacy;
        var columns=new FinalSourceEncoding(mapper,true).encode(source);
        ObjectNode best=legacy;int bestTokens=QwenTokenCounter.count(legacy.toString());
        for(int variant=0;variant<5;variant++) {
            var candidate=variant==4?new ExactNumericDeltas(mapper).encode(columns):variant<2?columns.deepCopy():new AdaptiveNumericFragments(mapper,variant==3).encode(columns);
            if(variant>0)candidate=new AdaptiveNumericColumnText(mapper).encode(candidate);
            candidate.put(FIELD,VERSION);
            int tokens=QwenTokenCounter.count(candidate.toString());
            if(tokens<bestTokens){best=candidate;bestTokens=tokens;}
        }
        return best;
    }
    public static ObjectNode decode(ObjectMapper mapper,JsonNode wire) {
        if(!wire.has(FIELD))return (ObjectNode)new LosslessTables(mapper).decode(wire);
        if(!VERSION.equals(wire.path(FIELD).asString()))throw new IllegalArgumentException("UNKNOWN_OBSERVATION_WIRE");
        var decoded=(ObjectNode)wire.deepCopy();decoded.remove(FIELD);
        if(decoded.has(AdaptiveNumericColumnText.RULE_FIELD))decoded=AdaptiveNumericColumnText.decode(mapper,decoded);
        if(decoded.has(ExactNumericDeltas.FIELD))decoded=ExactNumericDeltas.decode(mapper,decoded);
        if(decoded.has(AdaptiveNumericFragments.RULE_FIELD))decoded=AdaptiveNumericFragments.decode(mapper,decoded);
        return new FinalSourceEncoding(mapper).decode(decoded);
    }
}
