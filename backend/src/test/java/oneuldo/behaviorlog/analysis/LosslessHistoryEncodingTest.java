package oneuldo.behaviorlog.analysis;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class LosslessHistoryEncodingTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    @Test void keeps_distinct_plays_every_source_value_and_event_order_while_sharing_repeated_geometry() {
        var root = mapper.createObjectNode().put("goal", "이번 목표는 그대로 둔다");
        var current = root.putObject("currentEnvironmentContext").put("layoutId", "classic");
        var history = root.putArray("practiceHistory");
        var geometry = mapper.createObjectNode();
        for (int i = 0; i < 50; i++) geometry.putArray("obstacle-" + i).add(i).add(i + 1).add(i + 2).add(i + 3);
        for (int play = 0; play < 12; play++) {
            var row = history.addObject().put("playOrder", play + 1).put("currentSession", play == 11);
            var source = row.putObject("recordedPractice").putObject("sourceMovementContext");
            source.putArray("sceneSources").addObject().put("geometrySource", "sceneSnapshot.startingConditions.geometry")
                    .set("recordedGeometry", geometry.deepCopy());
            var events = source.putArray("movementEventDetails");
            for (int event = 0; event < 6; event++) events.addObject().put("sequence", event + 1)
                    .put("timeMs", play * 1000 + event * 100).put("eventCode", "SHOP.SHELF_PROXIMITY_ENTERED")
                    .put("stationId", event % 2 == 0 ? "fresh" : "produce").put("isTargetZone", event % 2 == 0);
        }
        String original = mapper.writeValueAsString(root);
        var encoded = LosslessHistoryEncoding.encode(mapper, root);
        var wire = mapper.readTree(mapper.writeValueAsString(encoded));
        assertThat(LosslessHistoryEncoding.decodeHistory(mapper, wire)).isEqualTo(mapper.readTree(history.toString()));
        assertThat(encoded.path("goal")).isEqualTo(root.path("goal"));
        assertThat(encoded.path("currentEnvironmentContext")).isEqualTo(current);
        assertThat(mapper.writeValueAsString(root)).isEqualTo(original);
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(original));
    }

    @Test void nested_arrays_keep_empty_values_missing_fields_duplicates_and_reserved_source_keys() {
        var root = mapper.createObjectNode();
        var history = root.putArray("practiceHistory");
        for (int i = 0; i < 3; i++) {
            var row = history.addObject().put("sequence", i).put("~K0", "~T0");
            row.putArray("matrix").addArray().add(0).add(false).addNull();
            row.putArray("empty");
            row.putObject("$historyRef").put("$historyColumns", "original");
            row.putObject("$historyLiteral").putArray("$historyStrings").add(1000);
            row.putObject("$table").put("$literal", "source");
            if (i != 1) row.put("optional", "");
            row.putArray("longStrings").add("first-source-string").add("second-source-string").add("third-source-string")
                    .add("fourth-source-string").add("first-source-string").add("second-source-string").add("third-source-string").add("fourth-source-string");
        }
        var encoded = LosslessHistoryEncoding.encode(mapper, root);
        assertThat(LosslessHistoryEncoding.decodeHistory(mapper, mapper.readTree(encoded.toString())))
                .isEqualTo(mapper.readTree(history.toString()));
    }

    @Test void equal_length_array_columns_restore_original_position_including_one_element_source_arrays() {
        var codec = new LosslessEventColumns(mapper);
        var one = mapper.createArrayNode().addObject().put("constant", "source").put("value", 1);
        var two = mapper.createArrayNode().addObject().put("constant", "source").put("value", 2);
        var values = List.of((tools.jackson.databind.JsonNode) one, two, one.deepCopy(), two.deepCopy());
        var encoded = codec.encodeValues(values);
        assertThat(codec.decodeValues(encoded)).isEqualTo(mapper.valueToTree(values));
    }
}
