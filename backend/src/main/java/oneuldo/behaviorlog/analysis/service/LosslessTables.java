package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Reversible representation only. Reserved source keys are escaped. */
public final class LosslessTables {
    private final ObjectMapper mapper;
    public LosslessTables(ObjectMapper mapper) { this.mapper = mapper; }
    public JsonNode encode(JsonNode value) {
        if (value instanceof ObjectNode object) {
            ObjectNode result = mapper.createObjectNode();
            for (String key : object.propertyNames()) result.set(key, encode(object.get(key)));
            if (result.has("$table") || result.has("$literal") || result.has("$missing")) return mapper.createObjectNode().set("$literal", result);
            return result;
        }
        if (!(value instanceof ArrayNode array)) return value;
        ArrayNode plain = mapper.createArrayNode(); array.forEach(item -> plain.add(encode(item)));
        if (array.size() < 3 || !java.util.stream.StreamSupport.stream(array.spliterator(), false).allMatch(JsonNode::isObject)) return plain;
        Set<String> keys = new TreeSet<>(); array.forEach(item -> keys.addAll(((ObjectNode) item).propertyNames()));
        ObjectNode defaults = mapper.createObjectNode(); List<String> columns = new ArrayList<>();
        for (String key : keys) {
            JsonNode first = array.get(0).get(key);
            if (first != null && java.util.stream.StreamSupport.stream(array.spliterator(), false).allMatch(item -> first.equals(item.get(key)))) defaults.set(key, encode(first));
            else columns.add(key);
        }
        ArrayNode rows = mapper.createArrayNode();
        for (JsonNode item : array) {
            ArrayNode row = mapper.createArrayNode();
            for (String key : columns) row.add(item.has(key) ? encode(item.get(key)) : mapper.createObjectNode().put("$missing", true));
            rows.add(row);
        }
        ObjectNode packed = mapper.createObjectNode();
        packed.set("$table", mapper.valueToTree(columns)); packed.set("defaults", defaults); packed.set("rows", rows);
        return packed.toString().length() < plain.toString().length() ? packed : plain;
    }
    public JsonNode decode(JsonNode value) {
        if (value instanceof ArrayNode array) {
            ArrayNode result = mapper.createArrayNode(); array.forEach(item -> result.add(decode(item))); return result;
        }
        if (!(value instanceof ObjectNode object)) return value;
        if (object.has("$literal")) return decodeObject((ObjectNode) object.get("$literal"));
        if (!object.has("$table")) return decodeObject(object);
        JsonNode columns = object.path("$table"); ArrayNode result = mapper.createArrayNode();
        for (JsonNode row : object.path("rows")) {
            if (!row.isArray() || row.size() != columns.size()) throw new IllegalArgumentException("INVALID_TABLE_ROW");
            ObjectNode item = decodeObject((ObjectNode) object.path("defaults"));
            for (int i = 0; i < columns.size(); i++) {
                JsonNode cell = row.get(i);
                if (cell.isObject() && cell.size() == 1 && cell.path("$missing").asBoolean()) continue;
                item.set(columns.get(i).asString(), decode(cell));
            }
            result.add(item);
        }
        return result;
    }
    private ObjectNode decodeObject(ObjectNode object) {
        ObjectNode result = mapper.createObjectNode();
        for (String key : object.propertyNames()) result.set(key, decode(object.get(key)));
        return result;
    }
}
