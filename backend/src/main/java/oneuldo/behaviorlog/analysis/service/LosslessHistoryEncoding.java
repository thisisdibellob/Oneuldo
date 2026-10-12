package oneuldo.behaviorlog.analysis.service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Exact-value sharing and tables only. Keeps every source value and every event in order. */
public final class LosslessHistoryEncoding {
    public static final String VERSION = "history-source-v1";
    private static final String REF = "$historyRef";
    private static final String LITERAL = "$historyLiteral";
    private static final String COLUMNS = "$historyColumns";
    private static final String STRINGS = "$historyStrings";
    private final ObjectMapper mapper;
    private final Map<JsonNode, Integer> occurrences = new HashMap<>();
    private final Map<JsonNode, String> aliases = new LinkedHashMap<>();
    private final ObjectNode shared;

    private LosslessHistoryEncoding(ObjectMapper mapper) {
        this.mapper = mapper;
        shared = mapper.createObjectNode();
    }

    public static ObjectNode encode(ObjectMapper mapper, ObjectNode source) {
        var result = source.deepCopy();
        JsonNode history = result.get("practiceHistory");
        if (history == null || !history.isArray() || history.isEmpty()) return result;
        var codec = new LosslessHistoryEncoding(mapper);
        codec.count(history);
        var encoded = codec.value(history);
        var tables = new LosslessTables(mapper);
        var bundle = mapper.createObjectNode();
        bundle.set("practiceHistory", tables.encode(encoded));
        bundle.set("historySharedValues", tables.encode(codec.shared));
        var stringCounts = new LinkedHashMap<String, Integer>();
        countStrings(bundle, stringCounts);
        var strings = new LinkedHashMap<String, Integer>();
        stringCounts.forEach((text, count) -> {
            int original = QwenTokenCounter.count(mapper.valueToTree(text).toString());
            if (text.matches("~T[0-9]+") || count > 1 && (original - 5) * count > original + 5)
                strings.put(text, strings.size());
        });
        collectStringColumns(bundle, strings);
        var packedStrings = replaceStrings(mapper, bundle, strings);
        var keyCounts = new LinkedHashMap<String, Integer>();
        countKeys(packedStrings.path("practiceHistory"), keyCounts);
        countKeys(packedStrings.path("historySharedValues"), keyCounts);
        var keys = new LinkedHashMap<String, String>();
        keyCounts.forEach((key, count) -> {
            int original = QwenTokenCounter.count(mapper.valueToTree(key).toString());
            if (key.matches("~K[0-9]+") || count > 1 && (original - 3) * count > original + 3)
                keys.put(key, "~K" + keys.size());
        });
        result.set("practiceHistory", replaceKeys(mapper, packedStrings.path("practiceHistory"), keys));
        result.set("historySharedValues", replaceKeys(mapper, packedStrings.path("historySharedValues"), keys));
        result.set("historyStringValues", mapper.valueToTree(strings.keySet()));
        var names = mapper.createObjectNode();
        keys.forEach((original, alias) -> names.put(alias, original));
        result.set("historyPropertyNames", names);
        result.put("historySourceEncodingVersion", VERSION);
        result.put("historySourceEncoding", "practiceHistory와 historySharedValues는 모든 원본 값·사건 순서를 보존한 표현이다. "
                + "먼저 객체의 ~K숫자 속성명을 historyPropertyNames의 원래 속성명으로 복원한다. "
                + "먼저 ~T숫자 문자열을 historyStringValues의 해당 0기준 원본 문자열로 치환한다. 사전 안의 문자열 자체는 다시 치환하지 않는다. "
                + "$historyStrings의 정수 배열도 historyStringValues의 0기준 문자열 위치이며 배열 순서대로 복원한다. "
                + "$table는 열, rows는 원본 순서, defaults는 공통 값이다. 행마다 합쳐 객체로 읽고 $missing:true는 미기록, $literal은 원래 객체로 복원한다. "
                + "그 뒤 {$historyRef:H번호}는 historySharedValues의 같은 H번호 원본 값으로 재귀 치환한다. $historyLiteral은 예약 키를 포함한 원래 객체다. "
                + "$historyColumns는 count개 원본 배열의 data다. same은 모든 행의 같은 값, values는 행별 값, fields는 속성별 열, rest는 행별 나머지 속성이다. "
                + "dictionary/refs는 0기준 값 참조, prefix는 suffixes 앞에 붙이는 원문, groups/positions는 0기준 원래 행 위치다. 원래 배열 길이와 순서대로 복원하며 빈 값·0·false·null·누락을 구별한다. "
                + "items는 같은 길이 배열의 위치별 열이다. 각 열을 count개 값으로 복원한 뒤 행별로 같은 위치의 값을 합쳐 원래 배열로 읽는다. "
                + "공유 참조는 같은 값의 중복 표기만 줄이며 서로 다른 플레이·사건을 합치거나 생략한 것이 아니다. 같은 지도를 참조해도 각 행의 실제 목표·지원·입력 조건·방문 순서는 별개다.");
        return result;
    }

    /** Verification/offline reader: decodes the exact history; does not interpret its content. */
    public static JsonNode decodeHistory(ObjectMapper mapper, JsonNode prompt) {
        if (!prompt.has("historySourceEncodingVersion")) return prompt.path("practiceHistory").deepCopy();
        if (!VERSION.equals(prompt.path("historySourceEncodingVersion").asString()))
            throw new IllegalArgumentException("UNKNOWN_HISTORY_SOURCE_ENCODING");
        var tables = new LosslessTables(mapper);
        return restore(mapper, tables.decode(restoreStrings(mapper, restoreKeys(mapper, prompt.path("practiceHistory"), prompt.path("historyPropertyNames")), prompt.path("historyStringValues"))),
                tables.decode(restoreStrings(mapper, restoreKeys(mapper, prompt.path("historySharedValues"), prompt.path("historyPropertyNames")), prompt.path("historyStringValues"))), 0);
    }

    private void count(JsonNode node) {
        if (node.isObject() || node.isArray()) occurrences.merge(node, 1, Integer::sum);
        if (node.isObject()) node.forEach(this::count);
        else if (node.isArray()) node.forEach(this::count);
    }

    private JsonNode value(JsonNode node) {
        // This is a transport-size bound, never a behavioral threshold.
        if ((node.isObject() || node.isArray()) && occurrences.getOrDefault(node, 0) > 1 && node.toString().length() >= 80) {
            String alias = aliases.get(node);
            if (alias == null) {
                alias = "H" + (aliases.size() + 1);
                aliases.put(node, alias);
                shared.set(alias, literal(node));
            }
            return mapper.createObjectNode().put(REF, alias);
        }
        return literal(node);
    }

    private JsonNode literal(JsonNode node) {
        if (node instanceof ObjectNode object) {
            var result = mapper.createObjectNode();
            for (String key : object.propertyNames()) result.set(key, value(object.get(key)));
            if (result.has(REF) || result.has(LITERAL) || result.has(COLUMNS) || result.has(STRINGS)) return mapper.createObjectNode().set(LITERAL, result);
            return result;
        }
        if (node instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(value(item)));
            if (result.size() >= 3) {
                var values = new ArrayList<JsonNode>();
                result.forEach(values::add);
                var columns = mapper.createObjectNode().set(COLUMNS, new LosslessEventColumns(mapper).encodeValues(values));
                if (QwenTokenCounter.count(columns.toString()) < QwenTokenCounter.count(result.toString())) return columns;
            }
            return result;
        }
        return node.deepCopy();
    }

    private static JsonNode restore(ObjectMapper mapper, JsonNode node, JsonNode shared, int depth) {
        if (depth > 100) throw new IllegalArgumentException("INVALID_HISTORY_REFERENCE_DEPTH");
        if (node.isObject() && node.size() == 1 && node.has(COLUMNS))
            return restore(mapper, new LosslessEventColumns(mapper).decodeValues(node.get(COLUMNS)), shared, depth);
        if (node.isObject() && node.size() == 1 && node.has(REF)) {
            var alias = node.path(REF);
            if (!alias.isString() || !shared.has(alias.asString())) throw new IllegalArgumentException("UNKNOWN_HISTORY_REFERENCE");
            return restore(mapper, shared.get(alias.asString()), shared, depth + 1);
        }
        if (node.isObject() && node.size() == 1 && node.has(LITERAL)) {
            if (!(node.get(LITERAL) instanceof ObjectNode object)) throw new IllegalArgumentException("INVALID_HISTORY_LITERAL");
            return restoreObject(mapper, object, shared, depth);
        }
        if (node instanceof ObjectNode object) return restoreObject(mapper, object, shared, depth);
        if (node instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(restore(mapper, item, shared, depth)));
            return result;
        }
        return node.deepCopy();
    }

    private static ObjectNode restoreObject(ObjectMapper mapper, ObjectNode object, JsonNode shared, int depth) {
        var result = mapper.createObjectNode();
        for (String key : object.propertyNames()) result.set(key, restore(mapper, object.get(key), shared, depth));
        return result;
    }

    private static void countStrings(JsonNode node, Map<String, Integer> counts) {
        if (node.isString()) counts.merge(node.asString(), 1, Integer::sum);
        else if (node.isObject() || node.isArray()) node.forEach(value -> countStrings(value, counts));
    }

    private static JsonNode replaceStrings(ObjectMapper mapper, JsonNode node, Map<String, Integer> strings) {
        if (node.isString() && strings.containsKey(node.asString())
                && (node.asString().matches("~T[0-9]+") || QwenTokenCounter.count(mapper.valueToTree(node.asString()).toString()) > 6))
            return mapper.valueToTree("~T" + strings.get(node.asString()));
        if (node instanceof ObjectNode object) {
            var result = mapper.createObjectNode();
            for (String key : object.propertyNames()) result.set(key, replaceStrings(mapper, object.get(key), strings));
            return result;
        }
        if (node instanceof ArrayNode array) {
            if (array.size() >= 8 && java.util.stream.StreamSupport.stream(array.spliterator(), false).allMatch(JsonNode::isString)) {
                var refs = mapper.createArrayNode();
                array.forEach(value -> refs.add(strings.get(value.asString())));
                return mapper.createObjectNode().set(STRINGS, refs);
            }
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(replaceStrings(mapper, item, strings)));
            return result;
        }
        return node.deepCopy();
    }

    private static JsonNode restoreStrings(ObjectMapper mapper, JsonNode node, JsonNode strings) {
        if (node.isObject() && node.size() == 1 && node.has(LITERAL)) {
            var object = mapper.createObjectNode();
            for (String key : ((ObjectNode)node.get(LITERAL)).propertyNames())
                object.set(key, restoreStrings(mapper, node.get(LITERAL).get(key), strings));
            return mapper.createObjectNode().set(LITERAL, object);
        }
        if (node.isObject() && node.size() == 1 && node.has(STRINGS)) {
            var result = mapper.createArrayNode();
            for (var index : node.get(STRINGS)) {
                if (!index.isIntegralNumber() || index.asInt() < 0 || index.asInt() >= strings.size())
                    throw new IllegalArgumentException("UNKNOWN_HISTORY_STRING_REFERENCE");
                result.add(strings.get(index.asInt()).deepCopy());
            }
            return result;
        }
        if (node.isString() && node.asString().matches("~T[0-9]+")) {
            int index = Integer.parseInt(node.asString().substring(2));
            if (!strings.isArray() || index >= strings.size()) throw new IllegalArgumentException("UNKNOWN_HISTORY_STRING_REFERENCE");
            return strings.get(index).deepCopy();
        }
        if (node instanceof ObjectNode object) {
            var result = mapper.createObjectNode();
            for (String key : object.propertyNames()) result.set(key, restoreStrings(mapper, object.get(key), strings));
            return result;
        }
        if (node instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(restoreStrings(mapper, item, strings)));
            return result;
        }
        return node.deepCopy();
    }

    private static void collectStringColumns(JsonNode node, Map<String, Integer> strings) {
        if (node.isArray() && node.size() >= 8 && java.util.stream.StreamSupport.stream(node.spliterator(), false).allMatch(JsonNode::isString))
            node.forEach(value -> strings.computeIfAbsent(value.asString(), ignored -> strings.size()));
        else if (node.isObject() || node.isArray()) node.forEach(value -> collectStringColumns(value, strings));
    }

    private static void countKeys(JsonNode node, Map<String, Integer> counts) {
        if (node instanceof ObjectNode object) for (String key : object.propertyNames()) {
            counts.merge(key, 1, Integer::sum);
            countKeys(object.get(key), counts);
        }
        else if (node.isArray()) node.forEach(value -> countKeys(value, counts));
    }

    private static JsonNode replaceKeys(ObjectMapper mapper, JsonNode node, Map<String, String> keys) {
        if (node instanceof ObjectNode object) {
            var result = mapper.createObjectNode();
            for (String key : object.propertyNames()) result.set(keys.getOrDefault(key, key), replaceKeys(mapper, object.get(key), keys));
            return result;
        }
        if (node instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(replaceKeys(mapper, item, keys)));
            return result;
        }
        return node.deepCopy();
    }

    private static JsonNode restoreKeys(ObjectMapper mapper, JsonNode node, JsonNode names) {
        if (node instanceof ObjectNode object) {
            var result = mapper.createObjectNode();
            for (String key : object.propertyNames()) {
                if (key.matches("~K[0-9]+") && !names.has(key)) throw new IllegalArgumentException("UNKNOWN_HISTORY_PROPERTY_REFERENCE");
                String original = names.has(key) ? names.get(key).asString() : key;
                result.set(original, restoreKeys(mapper, object.get(key), names));
            }
            return result;
        }
        if (node instanceof ArrayNode array) {
            var result = mapper.createArrayNode();
            array.forEach(item -> result.add(restoreKeys(mapper, item, names)));
            return result;
        }
        return node.deepCopy();
    }
}
