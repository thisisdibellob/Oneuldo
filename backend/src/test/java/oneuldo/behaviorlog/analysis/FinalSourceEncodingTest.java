package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.AnalysisReviewPrompt;
import oneuldo.behaviorlog.analysis.service.FinalSourceEncoding;
import oneuldo.behaviorlog.analysis.service.LosslessEventColumns;
import oneuldo.behaviorlog.analysis.service.LosslessTables;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import oneuldo.behaviorlog.analysis.service.ReadableSourceFacts;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class FinalSourceEncodingTest {
    @Test void repeated_long_literal_text_is_shared_without_changing_source_or_readable_facts() {
        var source=mapper.createObjectNode();
        String original="원본에 기록된 지원 조건과 이동 배치 설명을 그대로 보존하며 실제로 관찰되지 않은 행동은 추가하지 않습니다. 😀 é";
        for(int i=0;i<12;i++) source.put("recorded-note-"+i,original);
        source.put("literal-marker","$r");source.putNull("missingValue");source.put("falseValue",false);
        var before=source.deepCopy();var encoded=codec.encode(source);
        assertThat(encoded.has("finalSourceShared")).isTrue();
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(before);
        var readable=codec.encodeReadable(source);
        assertThat(readable.path(ReadableSourceFacts.FIELD)).isEqualTo(ReadableSourceFacts.build(mapper,source));
        var restored=codec.decode(readable);restored.remove(ReadableSourceFacts.FIELD);
        assertThat(restored).isEqualTo(before);assertThat(source).isEqualTo(before);
    }
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final FinalSourceEncoding codec = new FinalSourceEncoding(mapper);

    @Test void sparse_rows_keep_missing_null_zero_false_empty_values_and_unicode_in_original_order() {
        var source = object("""
                {"sourceEventDetails":[
                  {"id":"E0","sessionId":"S1","timeMs":0,"eventCode":"SHOP.CART_OPENED","value":0,"optional":null,"text":"😀안내","matrix":[[null,0,false,""],[]]},
                  {"id":"E1","sessionId":"S1","timeMs":0.125,"eventCode":"SHOP.CART_OPENED","value":false,"text":"😁안내","matrix":[[0,null,"",false],[]]},
                  {"id":"E2","sessionId":"S1","timeMs":9007199254740993,"eventCode":"SHOP.CART_OPENED","value":"","optional":false,"text":"한글 é 🧺","emptyObject":{},"emptyArray":[]},
                  {"id":"E3","sessionId":"S1","timeMs":-0.0,"eventCode":"SHOP.CART_OPENED","value":null,"optional":"","text":"","matrix":[[]]},
                  {"id":"E4","sessionId":"S1","timeMs":1.0e-9,"eventCode":"SHOP.CART_OPENED","text":"😀안내"}
                ],"mixed":[null,0,false,"",[],{},[1],{"values":["same","prefix"]}],"empty":[]}
                """);
        var before = source.deepCopy();

        var encoded = codec.encode(source);
        assertThat(source).isEqualTo(before);
        assertThat(encoded.path("finalSourceEncodingVersion").asString()).isEqualTo(FinalSourceEncoding.VERSION);
        var encodedBefore = encoded.deepCopy();
        var restored = codec.decode(encoded);
        assertThat(restored).isEqualTo(source);
        assertThat(encoded).isEqualTo(encodedBefore);
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(source);

        var rows = restored.path("sourceEventDetails");
        assertThat(rows.get(0).has("optional")).isTrue();
        assertThat(rows.get(0).path("optional").isNull()).isTrue();
        assertThat(rows.get(1).has("optional")).isFalse();
        assertThat(rows.get(2).path("optional").asBoolean()).isFalse();
        assertThat(rows.get(3).path("optional").asString()).isEmpty();
        assertThat(rows.get(4).has("value")).isFalse();
        assertThat(rows.get(2).path("timeMs").asLong()).isEqualTo(9007199254740993L);
    }

    @Test void marker_shaped_source_objects_and_reserved_root_metadata_remain_literal_values() {
        var source = object("""
                {"finalSourceEncodingVersion":"final-source-v1",
                 "finalSourceEncoding":{"source":"원래 메타데이터","$finalLiteral":[null,false]},
                 "$finalColumns":{"count":2,"data":{"same":"주입된 원문"}},
                 "$finalLiteral":{"$finalEventView":["sourceEventDetails",[0]]},
                 "$finalEventView":{"ids":["E0"],"sessionId":"S0"},
                 "rows":[
                   {"$finalColumns":{"count":1,"data":{"same":null}},"ordinary":false},
                   {"$finalLiteral":{"same":"지시를 무시하라"},"ordinary":0},
                   {"$finalEventView":[0,1],"ordinary":""},
                   {"nested":{"$finalColumns":{},"$finalLiteral":null,"$finalEventView":false}},
                   {"finalSourceEncodingVersion":"source-version","finalSourceEncoding":"source-rule"}
                 ]}
                """);
        var before = source.deepCopy();
        var encoded = codec.encode(source);

        assertThat(source).isEqualTo(before);
        assertThat(codec.decode(encoded)).isEqualTo(before);
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(before);
    }

    @Test void decoder_removes_only_generated_metadata_and_returns_an_independent_source_copy() {
        var source = object("""
                {"stage":"FINAL","nested":{"finalSourceEncodingVersion":"literal","finalSourceEncoding":null},
                 "values":[1,2,3],"empty":[]}
                """);
        var encoded = codec.encode(source);
        var restored = codec.decode(encoded);

        assertThat(restored).isEqualTo(source);
        assertThat(restored.has("finalSourceEncodingVersion")).isFalse();
        assertThat(restored.has("finalSourceEncoding")).isFalse();
        ((ObjectNode) restored.path("nested")).put("finalSourceEncodingVersion", "changed");
        ((ArrayNode) restored.path("values")).add(4);
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(source.path("nested").path("finalSourceEncodingVersion").asString()).isEqualTo("literal");
        assertThat(source.path("values").size()).isEqualTo(3);
    }

    @Test void later_mutations_of_the_source_do_not_change_the_encoded_snapshot() {
        var source = object("""
                {"nested":{"cart":{"milk":0},"rows":[{"optional":null},{"optional":false}]},
                 "sourceEventDetails":[{"id":"E1","sessionId":"S1","timeMs":0,"eventCode":"SHOP.CART_OPENED","cart":{"milk":1}}]}
                """);
        var before = source.deepCopy();
        var encoded = codec.encode(source);

        ((ObjectNode) source.path("nested").path("cart")).put("milk", 99);
        ((ArrayNode) source.path("nested").path("rows")).removeAll();
        ((ObjectNode) source.path("sourceEventDetails").get(0).path("cart")).put("milk", 99);
        source.put("addedAfterEncoding", "later");
        assertThat(codec.decode(encoded)).isEqualTo(before);
    }

    @Test void exact_event_views_keep_evidence_order_duplicates_and_parent_movement_sessions() {
        var source = evidenceSource();
        var refs = source.putArray("evidenceReferences");
        refs.add(reference("M2", "S2", 2, "SHOP.MOVEMENT_BLOCKED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E3", "S2", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E2", "S1", 3, "SHOP.QUANTITY_CHANGED"));
        refs.add(reference("M1", "S1", 2, "SHOP.MOVEMENT_BLOCKED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        var before = source.deepCopy();

        var encoded = codec.encode(source);
        assertThat(encoded.path("evidenceReferences").toString()).contains("\"$ev\"");
        assertThat(codec.decode(encoded)).isEqualTo(before);
        var restoredRefs = codec.decode(mapper.readTree(encoded.toString())).path("evidenceReferences");
        assertThat(restoredRefs).isEqualTo(refs);
        assertThat(restoredRefs.get(0).path("sessionId").asString()).isEqualTo("S2");
        assertThat(restoredRefs.get(4).path("sessionId").asString()).isEqualTo("S1");
        assertThat(restoredRefs.get(1)).isEqualTo(restoredRefs.get(5));
        assertThat(source).isEqualTo(before);
    }

    @Test void an_id_with_conflicting_source_tuples_stays_literal_in_every_session() {
        var source = evidenceSource();
        ((ObjectNode) source.path("sourceEventDetails").get(1)).put("id", "E1");
        ((ObjectNode) source.path("sourceMovementContext").path("sessions").get(1).path("movementEventDetails").get(0))
                .put("id", "M1");
        var refs = source.putArray("evidenceReferences");
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E1", "S2", 1, "SHOP.CART_OPENED"));
        refs.add(reference("M1", "S2", 2, "SHOP.MOVEMENT_BLOCKED"));
        refs.add(reference("M1", "S1", 2, "SHOP.MOVEMENT_BLOCKED"));

        var encoded = codec.encode(source);
        assertThat(encoded.path("evidenceReferences").toString()).doesNotContain("\"$ev\"");
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(codec.decode(mapper.readTree(encoded.toString())).path("evidenceReferences")).isEqualTo(refs);
    }

    @Test void unsupported_missing_unmatched_or_nonexact_evidence_attributes_keep_original_literals() {
        var source = evidenceSource();
        var refs = source.putArray("evidenceReferences");
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED").put("extra", "원문 속성"));
        refs.add(reference("E1", "other-session", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E1", "S1", 2, "SHOP.CART_OPENED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_CLOSED"));
        refs.add(reference("unknown-event", "S1", 1, "SHOP.CART_OPENED"));
        var textTime = reference("E1", "S1", 1, "SHOP.CART_OPENED");
        textTime.put("timeMs", "1"); refs.add(textTime);
        var nullTime = reference("E1", "S1", 1, "SHOP.CART_OPENED");
        nullTime.putNull("timeMs"); refs.add(nullTime);
        for (String missing : List.of("id", "sessionId", "timeMs", "eventCode")) {
            var row = reference("E1", "S1", 1, "SHOP.CART_OPENED");
            row.remove(missing); refs.add(row);
        }
        var nullCode = reference("E1", "S1", 1, "SHOP.CART_OPENED");
        nullCode.putNull("eventCode"); refs.add(nullCode);
        refs.addNull().add(false).add(0).add("");
        var before = source.deepCopy();

        var encoded = codec.encode(source);
        assertThat(encoded.path("evidenceReferences").toString()).doesNotContain("\"$ev\"");
        assertThat(codec.decode(encoded)).isEqualTo(before);
        assertThat(codec.decode(mapper.readTree(encoded.toString())).path("evidenceReferences")).isEqualTo(refs);
        assertThat(source).isEqualTo(before);
    }

    @Test void matching_and_literal_evidence_can_coexist_without_dropping_extra_attributes() {
        var source = evidenceSource();
        var refs = source.putArray("evidenceReferences");
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED").put("annotation", "이 속성도 원문"));
        refs.add(reference("M2", "S2", 2, "SHOP.MOVEMENT_BLOCKED"));
        refs.add(reference("M2", "S2", 2, "SHOP.MOVEMENT_BLOCKED").put("timeMs", 2.0));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));

        var encoded = codec.encode(source);
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(source);
        assertThat(restored.path("evidenceReferences").get(1).path("annotation").asString()).isEqualTo("이 속성도 원문");
        assertThat(restored.path("evidenceReferences").get(3).path("timeMs").isIntegralNumber()).isFalse();
    }

    @Test void incomplete_or_unsupported_source_tuples_cannot_turn_matching_literals_into_views() {
        var source = object("""
                {"sourceEventDetails":[
                  {"id":"missing-code","sessionId":"S1","timeMs":0},
                  {"id":"null-time","sessionId":"S1","timeMs":null,"eventCode":"SHOP.CART_OPENED"},
                  {"id":"text-time","sessionId":"S1","timeMs":"0","eventCode":"SHOP.CART_OPENED"},
                  {"id":"blank-code","sessionId":"S1","timeMs":0,"eventCode":""},
                  {"id":"","sessionId":"S1","timeMs":0,"eventCode":"SHOP.CART_OPENED"}
                ],"sourceMovementContext":{"sessions":[
                  {"movementEventDetails":[{"id":"missing-session","timeMs":0,"eventCode":"SHOP.MOVEMENT_BLOCKED"}]}
                ]}}
                """);
        var refs = source.putArray("evidenceReferences");
        for (var row : source.path("sourceEventDetails")) refs.add(row.deepCopy());
        refs.add(source.path("sourceMovementContext").path("sessions").get(0).path("movementEventDetails").get(0).deepCopy());

        var encoded = codec.encode(source);
        assertThat(encoded.path("evidenceReferences").toString()).doesNotContain("\"$ev\"");
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(codec.decode(mapper.readTree(encoded.toString())).path("evidenceReferences")).isEqualTo(refs);
    }

    @Test void repeated_final_source_values_are_smaller_on_the_wire_and_still_restore_exactly() {
        var source = mapper.createObjectNode().put("stage", "FINAL");
        var details = source.putArray("sourceEventDetails");
        var refs = source.putArray("evidenceReferences");
        for (int i = 0; i < 80; i++) {
            String id = "event-source-" + i;
            details.addObject().put("id", id).put("sessionId", "recorded-session-1").put("timeMs", i * 125)
                    .put("eventCode", "SHOP.QUANTITY_CHANGED").put("sequence", i).put("itemId", "milk")
                    .put("quantityBefore", i % 3).put("quantityAfter", (i + 1) % 3).put("selectedQuantity", (i + 1) % 3);
            refs.add(reference(id, "recorded-session-1", i * 125, "SHOP.QUANTITY_CHANGED"));
        }

        var encoded = codec.encode(source);
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(source);
    }

    @Test void exact_task_product_and_submission_views_keep_all_original_values_and_row_order() {
        var source = comparisonSource();
        var comparison = AnalysisReviewPrompt.taskComparisonSource(mapper, source);
        ((ArrayNode) comparison.path("requirements")).add(comparison.path("requirements").get(0).deepCopy());
        ((ArrayNode) comparison.path("selectedProducts")).add(comparison.path("selectedProducts").get(0).deepCopy());
        ((ArrayNode) comparison.path("submissions")).add(comparison.path("submissions").get(0).deepCopy());
        source.set("taskComparisonSource", comparison);
        var before = source.deepCopy();

        var encoded = codec.encode(source);
        assertThat(encoded.path("taskComparisonSource").toString()).contains("\"$v\"", "\"T\"", "\"P\"", "\"E\"");
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(before);
        assertThat(restored.path("taskComparisonSource")).isEqualTo(comparison);
        assertThat(restored.path("taskComparisonSource").path("selectedProducts").get(0).path("product").path("price").isIntegralNumber()).isFalse();
        assertThat(restored.path("taskComparisonSource").path("submissions").get(0).path("cart").path("milk").asInt()).isZero();
        assertThat(source).isEqualTo(before);
    }

    @Test void comparison_views_require_the_same_field_set_types_and_values_as_the_raw_projection() {
        var source = comparisonSource();
        var comparison = AnalysisReviewPrompt.taskComparisonSource(mapper, source);
        ((ObjectNode) comparison.path("requirements").get(0)).remove("budget");
        ((ObjectNode) comparison.path("selectedProducts").get(0).path("product")).put("price", 2200);
        ((ObjectNode) comparison.path("submissions").get(0)).put("annotation", "이 원문 속성도 유지한다");
        ((ArrayNode) comparison.path("requirements")).addNull();
        ((ArrayNode) comparison.path("selectedProducts")).add(false);
        ((ArrayNode) comparison.path("submissions")).add(0);
        source.set("taskComparisonSource", comparison);

        var encoded = codec.encode(source);
        assertThat(encoded.path("taskComparisonSource").toString()).doesNotContain("\"$v\"");
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(source);
        assertThat(restored.path("taskComparisonSource").path("requirements").get(0).has("budget")).isFalse();
        assertThat(restored.path("taskComparisonSource").path("selectedProducts").get(0).path("product").path("price").isIntegralNumber()).isTrue();
        assertThat(restored.path("taskComparisonSource").path("submissions").get(0).path("annotation").asString()).isEqualTo("이 원문 속성도 유지한다");
    }

    @Test void ambiguous_task_or_raw_event_ids_keep_comparison_rows_literal() {
        var source = comparisonSource();
        var comparison = AnalysisReviewPrompt.taskComparisonSource(mapper, source);
        var tasks = (ArrayNode) source.path("taskContext");
        var conflictingTask = tasks.get(0).deepCopy();
        ((ObjectNode) conflictingTask.path("mission")).put("budget", 1);
        tasks.add(conflictingTask);
        var events = (ArrayNode) source.path("sourceEventDetails");
        var conflictingProduct = events.get(0).deepCopy();
        ((ObjectNode) conflictingProduct.path("selectedProduct")).put("name", "다른 원문 상품");
        events.add(conflictingProduct);
        var conflictingSubmission = events.get(1).deepCopy();
        ((ObjectNode) conflictingSubmission.path("cart")).put("milk", 99);
        events.add(conflictingSubmission);
        source.set("taskComparisonSource", comparison);

        var encoded = codec.encode(source);
        assertThat(encoded.path("taskComparisonSource").toString()).doesNotContain("\"$v\"");
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(source);
    }

    @Test void v2_root_metadata_view_and_sharing_markers_are_literal_when_they_come_from_the_source() {
        var source = object("""
                {"finalSourceEncodingVersion":"source-version",
                 "finalSourceEncoding":{"instruction":"원래 지시문", "$ev":"E1"},
                 "finalSourceShared":{"0":{"$r":0}},
                 "$ev":"E1","$v":["T","E1"],"$x":{"$ev":"E1"},"$r":0,"$h":{"$r":0},
                 "nested":{"finalSourceEncodingVersion":null,"finalSourceEncoding":false,"finalSourceShared":[],
                    "$a":[1,{"=":0}],"$m":[["원문"],[null]],"$l":{"$ev":"E1"}},
                 "rows":[{"$ev":"E1"},{"$v":["P","E2"]},{"$x":{"$v":["E","E3"]}},
                    {"$r":1},{"$h":{"$r":0}},{"$a":null,"$m":false,"$l":[]} ]}
                """);
        var before = source.deepCopy();

        var encoded = codec.encode(source);
        assertThat(encoded.path("finalSourceEncodingVersion").asString()).isEqualTo(FinalSourceEncoding.VERSION);
        assertThat(codec.decode(encoded)).isEqualTo(before);
        assertThat(codec.decode(mapper.readTree(encoded.toString()))).isEqualTo(before);
        assertThat(source).isEqualTo(before);
    }

    @Test void shared_containers_preserve_raw_reference_markers_and_independent_restored_copies() {
        var source = mapper.createObjectNode();
        var common = object("""
                {"$r":0,"$h":{"$r":1},"$ev":"raw-id","$v":["P","raw-id"],
                 "source":{"description":"긴 원문 값은 여러 필드에 반복되어도 각 원본 사본과 예약 키를 그대로 보존한다.",
                    "nullValue":null,"zero":0,"falseValue":false,"emptyArray":[],"emptyObject":{},"unicode":"😀 한글 é"}}
                """);
        for (int i = 0; i < 12; i++)
            source.set("copy-" + i, mapper.createArrayNode().add(common.deepCopy()).add(i));
        var before = source.deepCopy();
        var encoded = codec.encode(source);

        assertThat(encoded.has("finalSourceShared")).isTrue();
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored).isEqualTo(before);
        ((ObjectNode) restored.path("copy-0").get(0).path("source")).put("zero", 99);
        assertThat(restored.path("copy-1").get(0).path("source").path("zero").asInt()).isZero();
        assertThat(codec.decode(encoded)).isEqualTo(before);
        assertThat(source).isEqualTo(before);
    }

    @Test void v1_audit_sources_with_old_columns_and_event_views_still_decode_exactly() {
        var source = evidenceSource();
        var refs = source.putArray("evidenceReferences");
        refs.add(reference("M2", "S2", 2, "SHOP.MOVEMENT_BLOCKED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        refs.add(reference("E1", "S1", 1, "SHOP.CART_OPENED"));
        source.set("literal", object("{\"$finalEventView\":\"이 값은 원문\"}"));
        var legacy = source.deepCopy();
        var details = source.path("sourceEventDetails");
        legacy.set("sourceEventDetails", mapper.createObjectNode().set("$finalColumns",
                new LosslessEventColumns(mapper).encodeValues(List.of(details.get(0), details.get(1), details.get(2)))));
        var legacyRefs = legacy.putArray("evidenceReferences");
        legacyRefs.addObject().put("$finalEventView", "M2");
        legacyRefs.addObject().put("$finalEventView", "E1");
        legacyRefs.addObject().put("$finalEventView", "E1");
        legacy.set("literal", mapper.createObjectNode().set("$finalLiteral", source.path("literal")));
        legacy.put("finalSourceEncodingVersion", "final-source-v1");
        legacy.put("finalSourceEncoding", LEGACY_RULE);
        var before = legacy.deepCopy();

        assertThat(codec.decode(mapper.readTree(legacy.toString()))).isEqualTo(source);
        assertThat(legacy).isEqualTo(before);
        assertThat(codec.decode(new LosslessTables(mapper).encode(legacy))).isEqualTo(source);
    }

    private ObjectNode comparisonSource() {
        return object("""
                {"taskContext":[{"sessionId":"S1","sourceEventId":"E1","mission":{
                    "objectives":[{"name":"우유","allowedProductIds":["milk"],"quantity":0,"optional":null}],
                    "budget":22000,"successMessage":"미리 정의된 안내"}}],
                 "sourceEventDetails":[
                    {"id":"E2","sessionId":"S1","timeMs":2,"eventCode":"SHOP.QUANTITY_CHANGED",
                        "selectedProduct":{"id":"milk","name":"흰 우유","detail":"900mL","salesUnit":"개","price":2200.0,"attributes":{"flavor":"plain"}},
                        "selectedQuantity":0},
                    {"id":"E3","sessionId":"S1","timeMs":3,"eventCode":"SHOP.CHECKOUT_SUBMITTED",
                        "cart":{"milk":0},"cartTotalAmount":0,"optional":null}
                 ]}
                """);
    }

    private static final String LEGACY_RULE = "{$finalColumns:{count,data}}는 count개 원본 행을 원래 순서대로 복원하는 무손실 표현이다. "
            + "data의 same은 모든 행의 동일 원문, values는 행별 원문, fields는 속성별 열, rest는 행별 나머지 속성이다. "
            + "dictionary/refs는 0기준 원문 참조, groups/positions는 0기준 원래 행 위치, prefix/suffixes는 그대로 이어 붙인 원문, items는 같은 길이 배열의 위치별 열이다. "
            + "빈 값·0·false·null·누락을 구별하며 사건·판정·수치는 생략하거나 바꾸지 않는다. $finalLiteral은 예약 키가 있는 원래 객체다. "
            + "evidenceReferences의 {$finalEventView:E번호}는 sourceEventDetails 또는 sourceMovementContext.sessions[].movementEventDetails에서 같은 id인 사건의 id/sessionId/timeMs/eventCode 원문을 그대로 다시 보여주는 참조다. "
            + "이동 사건의 sessionId는 해당 부모 세션 값이다. 다른 객체 행은 원래 값이며 허용 근거 ID와 순서는 유지한다.";

    private ObjectNode evidenceSource() {
        return object("""
                {"sourceEventDetails":[
                  {"id":"E1","sessionId":"S1","timeMs":1,"eventCode":"SHOP.CART_OPENED","sequence":4,"cart":{"milk":0}},
                  {"id":"E3","sessionId":"S2","timeMs":1,"eventCode":"SHOP.CART_OPENED","sequence":9,"cart":{"milk":1}},
                  {"id":"E2","sessionId":"S1","timeMs":3,"eventCode":"SHOP.QUANTITY_CHANGED","quantityBefore":0,"quantityAfter":1}
                ],"sourceMovementContext":{"sessions":[
                  {"sessionId":"S1","movementEventDetails":[{"id":"M1","timeMs":2,"eventCode":"SHOP.MOVEMENT_BLOCKED","sequence":5,"blocked":false}]},
                  {"sessionId":"S2","movementEventDetails":[{"id":"M2","timeMs":2,"eventCode":"SHOP.MOVEMENT_BLOCKED","sequence":10,"blocked":true}]}
                ]}}
                """);
    }

    private ObjectNode reference(String id, String session, long time, String code) {
        var row = mapper.createObjectNode().put("id", id).put("sessionId", session).put("eventCode", code);
        row.set("timeMs", mapper.readTree(Long.toString(time)));
        return row;
    }

    private ObjectNode object(String json) {
        return (ObjectNode) mapper.readTree(json);
    }
}
