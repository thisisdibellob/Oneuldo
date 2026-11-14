package oneuldo.behaviorlog.analysis;

import java.util.*;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;

class ReadableQuantityRowsTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    ObjectNode rows(int first,int count,String product,String detail) {
        var rows=m.createObjectNode();
        for(int i=0;i<count;i++)rows.putObject("E"+(first+i)).put("sessionId","S1").put("sequence",first+i)
            .put("eventCode","SHOP.QUANTITY_CHANGED").put("itemId",product).put("quantityBefore",i).put("quantityAfter",i+1)
            .put("recordedProductId",product).put("recordedProductDetail",detail);
        return rows;
    }
    @Test void only_repeated_labels_are_shared_and_literal_id_quantity_pairs_stay_on_each_row() {
        var source=rows(100,20,"water","500mL");var before=source.deepCopy();var encoded=ReadableQuantityRows.encode(m,source);
        assertThat(encoded.path("$quantityRows")).hasSize(1);
        var block=encoded.path("$quantityRows").get(0);
        assertThat(block.path("common").path("recordedProductDetail").asString()).isEqualTo("500mL");
        assertThat(block.path("columns")).isEqualTo(m.valueToTree(List.of("eventId","sequence","quantityBefore","quantityAfter")));
        assertThat(block.path("rows").get(0)).isEqualTo(m.readTree("[\"E100\",100,0,1]"));
        assertThat(block.path("rows").get(19)).isEqualTo(m.readTree("[\"E119\",119,19,20]"));
        assertThat(encoded.toString()).doesNotContain("\"$r\"","\"$nf\"","\"$nc\"");
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
        assertThat(ReadableQuantityRows.decode(m,m.readTree(encoded.toString())).toString()).isEqualTo(source.toString());
        assertThat(source).isEqualTo(before);
    }
    @Test void original_order_types_missing_null_and_different_products_are_not_combined_or_filled() {
        var source=rows(10,12,"water","500mL");
        source.putObject("E22").put("sessionId","S1").put("sequence",22).put("eventCode","SHOP.SHELF_CLOSED").put("stationId","drink");
        source.setAll(rows(23,12,"milk","900mL"));
        source.putObject("E35").put("eventCode","SHOP.QUANTITY_CHANGED").put("sequence",35).put("quantityBefore",0).putNull("quantityAfter");
        source.putObject("E36").put("eventCode","SHOP.QUANTITY_CHANGED").put("sequence",36).put("quantityAfter","0");
        source.putObject("E37").put("eventCode","SHOP.QUANTITY_CHANGED").put("sequence",37).put("quantityBefore",0.5).put("quantityAfter",1.0);
        source.putObject("E38").put("eventCode","SHOP.QUANTITY_CHANGED").put("sequence",38).put("quantityBefore",false);
        var before=source.deepCopy();var encoded=ReadableQuantityRows.encode(m,source);var decoded=ReadableQuantityRows.decode(m,m.readTree(encoded.toString()));
        assertThat(decoded.toString()).isEqualTo(source.toString());
        assertThat(new ArrayList<>(decoded.propertyNames())).isEqualTo(new ArrayList<>(source.propertyNames()));
        assertThat(decoded.path("E35").has("quantityAfter")).isTrue();assertThat(decoded.path("E35").path("quantityAfter").isNull()).isTrue();
        assertThat(decoded.path("E36").has("quantityBefore")).isFalse();assertThat(decoded.path("E36").path("quantityAfter").isString()).isTrue();
        assertThat(decoded.path("E37").path("quantityBefore").isFloatingPointNumber()).isTrue();assertThat(decoded.path("E38").path("quantityBefore").isBoolean()).isTrue();
        assertThat(source).isEqualTo(before);
    }
    @Test void tiny_groups_and_reserved_looking_literal_strings_do_not_create_numeric_aliases() {
        var tiny=rows(1,3,"water","500mL");assertThat(ReadableQuantityRows.encode(m,tiny)).isEqualTo(tiny);
        var source=rows(100,20,"$r:$quantityRows/E1","500mL \" \\ null");
        assertThat(ReadableQuantityRows.decode(m,m.readTree(ReadableQuantityRows.encode(m,source).toString()))).isEqualTo(source);
    }
    @Test void duplicate_ids_wrong_columns_and_changed_cell_types_are_rejected() {
        var encoded=(ObjectNode)ReadableQuantityRows.encode(m,rows(100,20,"water","500mL"));
        var duplicate=encoded.deepCopy();((ArrayNode)duplicate.at("/$quantityRows/0/rows")).add(duplicate.at("/$quantityRows/0/rows/0").deepCopy());
        assertThatThrownBy(()->ReadableQuantityRows.decode(m,duplicate)).hasMessage("INVALID_READABLE_QUANTITY_ROWS");
        var columns=encoded.deepCopy();((ArrayNode)columns.at("/$quantityRows/0/columns")).set(2,m.getNodeFactory().stringNode("quantityAfter"));
        assertThatThrownBy(()->ReadableQuantityRows.decode(m,columns)).hasMessage("INVALID_READABLE_QUANTITY_ROWS");
        var value=encoded.deepCopy();((ArrayNode)value.at("/$quantityRows/0/rows/0")).set(2,m.getNodeFactory().stringNode("0"));
        assertThatThrownBy(()->ReadableQuantityRows.decode(m,value)).hasMessage("INVALID_READABLE_QUANTITY_ROWS");
    }
}
