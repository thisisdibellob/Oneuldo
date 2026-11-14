package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Reversible review input only. Candidate paths, quotes and the output contract stay literal. */
public final class ReviewSourceTransport {
    private ReviewSourceTransport() {}
    public static String encode(ObjectMapper mapper,ObjectNode source) {
        var facts=source.deepCopy();
        var literal=List.of("candidate","outputSchema","reviewVersion","scope","dimensionRule","literalClaimBoundary");
        facts.remove(literal);
        var packed=new FinalSourceEncoding(mapper,true).encodeCompact(facts);
        for(String field:literal)if(source.has(field))packed.set(field,source.get(field).deepCopy());
        String original=mapper.writeValueAsString(source),encoded=mapper.writeValueAsString(packed);
        // Preserve every literal source value, even for previously unseen structures.
        if(!new FinalSourceEncoding(mapper).decode(packed).equals(source))
            throw new IllegalStateException("REVIEW_SOURCE_TRANSPORT_MISMATCH");
        return QwenTokenCounter.count(encoded)<QwenTokenCounter.count(original)?encoded:original;
    }
}
