package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.FinalSourceColumns;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class FinalSourceColumnsTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final FinalSourceColumns codec = new FinalSourceColumns(mapper);

    @Test void sparse_rows_keep_absence_distinct_from_null_zero_false_and_empty_values() {
        var source = json("""
                {"rows":[
                  {"id":"E1","value":0,"optional":null,"time":9007199254740993},
                  {"id":"E2","value":false,"time":0.125},
                  {"id":"E3","value":"","optional":false,"time":-0.0},
                  {"id":"E4","value":null,"optional":"","time":1.0e-9},
                  {"id":"E5","optional":0,"time":9007199254740994}
                ],"emptyArray":[],"emptyObject":{}}
                """);

        var restored = roundTrip(source);
        var rows = restored.path("rows");
        assertThat(rows.get(0).has("optional")).isTrue();
        assertThat(rows.get(0).path("optional").isNull()).isTrue();
        assertThat(rows.get(1).has("optional")).isFalse();
        assertThat(rows.get(2).path("optional").isBoolean()).isTrue();
        assertThat(rows.get(3).path("optional").asString()).isEmpty();
        assertThat(rows.get(4).has("value")).isFalse();
        assertThat(rows.get(0).path("time").asLong()).isEqualTo(9007199254740993L);
        assertThat(rows.get(1).path("time").isIntegralNumber()).isFalse();
    }

    @Test void nested_mixed_arrays_and_unicode_restore_in_original_array_order() {
        var source = json("""
                {"matrix":[[null,0,false,"",[],{}],[false,null,"",0,{},[]],["😀안내","😁안내","한글 é 🧺",null,0,false]],
                 "mixed":[null,0,false,"",[],{},[1],[1,2,3],{"values":["same","prefix"],"nested":[{},[],null]}],
                 "rows":[{"labels":["😀같음","😀같음","😁다름"]},{"labels":["😁다름","😀같음","😀같음"]},{"labels":["😀같음","😁다름","😀같음"]}]}
                """);

        var restored = roundTrip(source);
        assertThat(restored.path("matrix").get(2).get(0).asString()).isEqualTo("😀안내");
        assertThat(restored.path("matrix").get(2).get(1).asString()).isEqualTo("😁안내");
        assertThat(restored.path("matrix").get(2).get(2).asString()).isEqualTo("한글 é 🧺");
        assertThat(restored.path("mixed").get(4).isArray()).isTrue();
        assertThat(restored.path("mixed").get(5).isObject()).isTrue();
    }

    @Test void source_objects_with_array_map_and_literal_markers_are_escaped_as_original_data() {
        var source = json("""
                {"$a":[2,{"=":"원래 값"}],"$m":[["x"],[0]],"$l":{"$a":[0,[]]},
                 "rows":[
                   {"$a":[1,{"=":null}],"ordinary":0},
                   {"$m":[["literal"],[false]],"ordinary":false},
                   {"$l":{"$m":[["원문"],[""]]},"ordinary":""},
                   {"nested":{"$a":null,"$m":false,"$l":[]}}
                 ]}
                """);

        var restored = roundTrip(source);
        assertThat(restored.path("$a").get(1).path("=").asString()).isEqualTo("원래 값");
        assertThat(restored.path("rows").get(3).path("nested").path("$a").isNull()).isTrue();
        assertThat(restored.path("rows").get(3).path("nested").path("$m").asBoolean()).isFalse();
    }

    @Test void keyed_maps_restore_key_order_and_the_exact_value_types() {
        var wire = json("""
                {"$m":[["west","east","south","north"],
                  [{"x":9007199254740993,"y":0.0},{"x":0,"optional":null},{"x":false,"y":"0"},{"x":[],"y":{}}]]}
                """);

        var restored = (ObjectNode) codec.decode(wire);
        assertThat(restored.propertyNames()).containsExactly("west", "east", "south", "north");
        assertThat(restored.path("west").path("x").asLong()).isEqualTo(9007199254740993L);
        assertThat(restored.path("west").path("y").isIntegralNumber()).isFalse();
        assertThat(restored.path("east").has("y")).isFalse();
        assertThat(restored.path("east").path("optional").isNull()).isTrue();
        assertThat(restored.path("south").path("x").isBoolean()).isTrue();
        assertThat(restored.path("south").path("y").isString()).isTrue();
        assertThat(restored.path("north").path("x").isArray()).isTrue();
        assertThat(restored.path("north").path("y").isObject()).isTrue();
        assertThat(codec.decode(mapper.readTree(codec.encode(restored).toString()))).isEqualTo(restored);
    }

    @Test void a_large_geometry_map_is_smaller_and_keeps_original_property_order() {
        var source = mapper.createObjectNode();
        for (int i = 0; i < 24; i++) {
            source.putObject("recorded-zone-" + i).put("x", i * 11).put("y", i * 17)
                    .put("width", 139.14999999999998).put("height", 73.6)
                    .put("orientation", "horizontal").put("recordedSource", "sceneSnapshot.startingConditions.geometry");
        }
        var keys = List.copyOf(source.propertyNames());
        var encoded = codec.encode(source);

        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
        var restored = (ObjectNode) codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(source);
        assertThat(restored.propertyNames()).containsExactlyElementsOf(keys);
    }

    @Test void string_field_aliases_use_the_exact_prefix_and_integer_value_from_every_row() {
        var source = aliasRows();
        var encoded = codec.encode(source);

        assertThat(encoded.toString()).contains("\"q\"");
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(source);

        var wire = json("""
                {"$a":[3,{"f":{"sequence":[0,-2,9007199254740993],"id":{"q":["사건-E","sequence"]}}}]}
                """);
        assertThat(codec.decode(wire)).isEqualTo(json("""
                [{"sequence":0,"id":"사건-E0"},{"sequence":-2,"id":"사건-E-2"},{"sequence":9007199254740993,"id":"사건-E9007199254740993"}]
                """));
    }

    @Test void one_mismatched_string_row_keeps_its_original_spelling_without_an_alias() {
        var source = aliasRows();
        ((ObjectNode) source.get(17)).put("id", "E000017");
        var encoded = codec.encode(source);

        assertThat(encoded.toString()).doesNotContain("\"q\"");
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(source);
        assertThat(restored.get(17).path("id").asString()).isEqualTo("E000017");
        assertThat(restored.get(18).path("id").asString()).isEqualTo("E18");
    }

    @Test void snapshots_are_independent_of_later_source_and_decoded_value_mutations() {
        var source = (ObjectNode) json("""
                {"cart":{"milk":0},"rows":[{"value":null},{"value":false},{"value":0}],"$a":[0,[]]}
                """);
        var before = source.deepCopy();
        var encoded = codec.encode(source);
        var encodedBefore = encoded.deepCopy();
        assertThat(source).isEqualTo(before);
        ((ObjectNode) source.path("cart")).put("milk", 99);
        ((ArrayNode) source.path("rows")).removeAll();

        var restored = (ObjectNode) codec.decode(encoded);
        assertThat(restored).isEqualTo(before);
        ((ObjectNode) restored.path("cart")).put("milk", 88);
        ((ArrayNode) restored.path("rows")).removeAll();
        assertThat(codec.decode(encoded)).isEqualTo(before);
        assertThat(encoded).isEqualTo(encodedBefore);
    }

    @Test void malformed_keyed_maps_reject_duplicate_nonstring_keys_and_wrong_row_counts() {
        for (String wire : List.of(
                "{\"$m\":[[\"x\",\"x\"],[0,1]]}",
                "{\"$m\":[[\"x\",0],[0,1]]}",
                "{\"$m\":[[\"x\",null],[0,1]]}",
                "{\"$m\":[[\"x\",\"y\"],[0]]}",
                "{\"$m\":[[\"x\"],[0,1]]}",
                "{\"$m\":[\"x\",[0]]}")) {
            assertThatThrownBy(() -> codec.decode(json(wire))).as(wire).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test void malformed_array_counts_and_dictionary_references_are_rejected() {
        for (String wire : List.of(
                "{\"$a\":[-1,[]]}",
                "{\"$a\":[1.5,[0]]}",
                "{\"$a\":[2,[0]]}",
                "{\"$a\":[1,[0,1]]}",
                "{\"$a\":[1,{\"#\":[[\"x\"],[1]]}]}",
                "{\"$a\":[1,{\"#\":[[\"x\"],[-1]]}]}",
                "{\"$a\":[1,{\"#\":[[\"x\"],[0.5]]}]}")) {
            assertThatThrownBy(() -> codec.decode(json(wire))).as(wire).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test void group_positions_and_alias_sources_cannot_invent_or_overwrite_rows() {
        for (String wire : List.of(
                "{\"$a\":[2,{\"g\":[[[0],{\"=\":0}],[[0],{\"=\":1}]]}]}",
                "{\"$a\":[2,{\"g\":[[[0,2],{\"=\":0}]]}]}",
                "{\"$a\":[2,{\"g\":[[[-1,1],{\"=\":0}]]}]}",
                "{\"$a\":[2,{\"g\":[[[0.5,1],{\"=\":0}]]}]}",
                "{\"$a\":[2,{\"g\":[[[0],{\"=\":0}]]}]}",
                "{\"$a\":[1,{\"f\":{\"id\":{\"q\":[\"E\",\"missing\"]}}}]}",
                "{\"$a\":[1,{\"f\":{\"sequence\":[\"1\"],\"id\":{\"q\":[\"E\",\"sequence\"]}}}]}",
                "{\"$a\":[1,{\"f\":{\"sequence\":[1.0],\"id\":{\"q\":[\"E\",\"sequence\"]}}}]}")) {
            assertThatThrownBy(() -> codec.decode(json(wire))).as(wire).isInstanceOf(IllegalArgumentException.class);
        }
    }

    private JsonNode roundTrip(JsonNode source) {
        var before = source.deepCopy();
        var encoded = codec.encode(source);
        var encodedBefore = encoded.deepCopy();
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(source).isEqualTo(before);
        assertThat(encoded).isEqualTo(encodedBefore);
        assertThat(restored).isEqualTo(before);
        return restored;
    }

    private ArrayNode aliasRows() {
        var rows = mapper.createArrayNode();
        for (int i = 0; i < 48; i++) rows.addObject().put("id", "E" + i).put("sequence", i);
        return rows;
    }

    private JsonNode json(String source) { return mapper.readTree(source); }
}
