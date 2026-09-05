package oneuldo.ai.service;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Stable JSON object order; preserves every array element, scalar value and prompt suffix. */
public final class AiRequestFingerprint {
    private AiRequestFingerprint() {}
    public static String of(ObjectMapper mapper,Object... parts) {
        try {
            String canonical=mapper.writeValueAsString(sorted(mapper.valueToTree(Arrays.asList(parts))));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch(NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static Object sorted(JsonNode node) {
        if(node.isObject()) {
            var result=new TreeMap<String,Object>();
            node.propertyNames().forEach(key -> result.put(key,sorted(node.get(key))));return result;
        }
        if(node.isArray()) { var result=new ArrayList<Object>();node.forEach(v -> result.add(sorted(v)));return result; }
        return node;
    }
}
