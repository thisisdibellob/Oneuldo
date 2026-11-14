package oneuldo.behaviorlog.analysis;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import oneuldo.behaviorlog.analysis.domain.AiObservationDigest;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.normalization.domain.CanonicalActionType;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import oneuldo.behaviorlog.normalization.registry.EvidencePolicy;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Literal source transport regressions. No model calls, new plays or inferred ability outcomes. */
class ReadableSourceFactsRegressionTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final FinalSourceEncoding codec = new FinalSourceEncoding(mapper);

    @Test void action_presence_counts_actual_later_search_without_turning_it_into_shelf_opening() {
        var source = mapper.createObjectNode();
        var events = source.putArray(SourceEventDetails.FIELD);
        events.addObject().put("id", "E10").put("sessionId", "S1").put("sequence", 10).put("eventCode", "SHOP.GENERAL_HELP_OPENED");
        var movement = source.putObject(MovementSourceContext.FIELD).putArray("sessions").addObject().put("sessionId", "S1");
        var details = movement.putArray("movementEventDetails");
        details.addObject().put("id", "E7").put("sequence", 7).put("eventCode", "SHOP.ITEM_SEARCH_STARTED");
        details.addObject().put("id", "E20").put("sequence", 20).put("eventCode", "SHOP.ITEM_SEARCH_STARTED");
        details.addObject().put("id", "E21").put("sequence", 21).put("eventCode", "SHOP.SHELF_PROXIMITY_ENTERED");
        var before = source.deepCopy();
        var facts = ReadableSourceFacts.build(mapper, source);
        var row = facts.path("recordedActionPresence").get(0);
        assertThat(row.path("providedEventCounts").path("SHOP.ITEM_SEARCH_STARTED").asInt()).isEqualTo(2);
        var after = row.path("afterGeneralHelp").get(0).path("providedLaterEventCounts");
        assertThat(after.path("SHOP.ITEM_SEARCH_STARTED").asInt()).isEqualTo(1);
        assertThat(after.path("SHOP.SHELF_PROXIMITY_ENTERED").asInt()).isEqualTo(1);
        assertThat(after.path("SHOP.SHELF_OPENED").asInt()).isZero();
        assertThat(after.path("SHOP.QUANTITY_CHANGED").asInt()).isZero();
        assertThat(source).isEqualTo(before);
        assertThat(facts.toString()).doesNotContain("\"judgment\"", "\"abilityScore\"");
    }

    @Test void action_presence_deduplicates_ids_and_does_not_invent_order_for_a_missing_sequence() {
        var source = mapper.createObjectNode();
        var events = source.putArray(SourceEventDetails.FIELD);
        events.addObject().put("id", "H").put("sessionId", "S1").put("sequence", 10).put("eventCode", "SHOP.GENERAL_HELP_OPENED");
        var search = events.addObject().put("id", "A").put("sessionId", "S1").put("eventCode", "SHOP.ITEM_SEARCH_STARTED");
        source.putObject(MovementSourceContext.FIELD).putArray("sessions").addObject().put("sessionId", "S1")
                .putArray("movementEventDetails").add(search.deepCopy());
        var row = ReadableSourceFacts.build(mapper, source).path("recordedActionPresence").get(0);
        assertThat(row.path("providedEventCounts").path("SHOP.ITEM_SEARCH_STARTED").asInt()).isEqualTo(1);
        assertThat(row.path("sequenceCoverageComplete").asBoolean()).isFalse();
        assertThat(row.path("afterGeneralHelp").get(0).path("providedLaterEventCounts").path("SHOP.ITEM_SEARCH_STARTED").asInt()).isZero();
    }

    @Test void source_pairs_keep_the_same_id_with_eggs_carrot_shelf_and_terminal_milk_values() {
        var source = literalSource();
        var before = source.deepCopy();
        var facts = ReadableSourceFacts.build(mapper, source);
        assertActionPairs(facts);
        assertThat(cartQuantity(facts.path("terminalSnapshots").get(0), "milk").asInt()).isEqualTo(2);
        assertThat(facts.path("terminalSnapshots").get(0).path("eventCode").asString()).isEqualTo("SHOP.CHECKOUT_SUBMITTED");
        assertThat(facts.path("requirements").get(0).path("objectives").get(0).path("acceptedProductIds"))
                .isEqualTo(source.path("taskContext").get(0).path("mission").path("objectives").get(0).path("acceptedProductIds"));
        assertThat(facts.toString()).doesNotContain("\"judgment\"", "\"matches\"", "\"abilityScore\"");
        assertLiteral(facts);
        assertThat(source).isEqualTo(before);
    }

    @Test void readable_encoding_adds_only_a_derived_view_and_does_not_grant_new_citations_or_mutate_source() {
        var source = literalSource();
        source.putArray("evidenceReferences").addObject().put("id", "E118").put("sessionId", "S1")
                .put("timeMs", 118).put("eventCode", "SHOP.QUANTITY_CHANGED");
        var before = source.deepCopy();
        var encoded = codec.encodeReadable(source);
        var encodedBefore = encoded.deepCopy();
        assertActionPairs(encoded.path(ReadableSourceFacts.FIELD));
        assertLiteral(encoded.path(ReadableSourceFacts.FIELD));
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        assertThat(restored.path("evidenceReferences")).isEqualTo(before.path("evidenceReferences"));
        assertThat(restored.path("evidenceReferences")).hasSize(1);
        assertThat(restored.path(ReadableSourceFacts.FIELD)).isEqualTo(ReadableSourceFacts.build(mapper, before));
        restored.remove(ReadableSourceFacts.FIELD);
        assertThat(restored).isEqualTo(before);
        assertThat(source).isEqualTo(before);
        assertThat(encoded).isEqualTo(encodedBefore);
        ((ObjectNode) encoded.path(ReadableSourceFacts.FIELD).path("eventsById").path("E118")).put("quantityAfter", 99);
        assertThat(source).isEqualTo(before);
    }

    @Test void missing_zero_null_and_reserved_looking_product_strings_remain_distinct_literal_values() {
        var source = literalSource();
        var events = (ArrayNode) source.path(SourceEventDetails.FIELD);
        events.addObject().put("id", "E200").put("eventCode", "SHOP.QUANTITY_CHANGED").put("quantityBefore", 0).putNull("quantityAfter");
        events.addObject().put("id", "E201").put("eventCode", "SHOP.QUANTITY_CHANGED");
        events.addObject().put("id", "E999").put("eventCode", "SHOP.UNRECOGNIZED_SOURCE").put("quantityAfter", 0);
        events.addObject().putNull("id").put("eventCode", "SHOP.QUANTITY_CHANGED").putNull("quantityAfter");
        var terminal = (ObjectNode) events.get(5);
        var cart = (ObjectNode) terminal.path("cart");
        String specialSku = "우유\"\\/$r:$a[0]";
        cart.put(specialSku, 0).putNull("$r").put("__proto__", false);
        terminal.putObject("timing").put("remainingSeconds", 0).putNull("elapsedSeconds").put("expired", false);
        ((ObjectNode) events.get(0).path("selectedProduct")).put("id", specialSku).put("detail", "$r:0 is source text");
        var before = source.deepCopy();
        var encoded = codec.encodeReadable(source);
        var facts = encoded.path(ReadableSourceFacts.FIELD);
        var zeroAndNull = facts.path("eventsById").path("E200");
        assertThat(zeroAndNull.path("quantityBefore").asInt()).isZero();
        assertThat(zeroAndNull.has("quantityAfter")).isTrue();
        assertThat(zeroAndNull.path("quantityAfter").isNull()).isTrue();
        assertThat(facts.path("eventsById").path("E201").has("quantityBefore")).isFalse();
        assertThat(facts.path("eventsById").path("E201").has("quantityAfter")).isFalse();
        assertThat(facts.path("eventsById").has("E999")).isFalse();
        assertThat(facts.path("eventsById").has("null")).isFalse();
        assertThat(facts.path("eventsById").path("E118").path("recordedProductId").asString()).isEqualTo(specialSku);
        var end = facts.path("terminalSnapshots").get(0);
        assertThat(cartQuantity(end, specialSku).asInt()).isZero();
        assertThat(cartQuantity(end, "$r").isNull()).isTrue();
        assertThat(cartQuantity(end, "__proto__").asBoolean()).isFalse();
        assertThat(end.path("timing").path("remainingSeconds").asInt()).isZero();
        assertThat(end.path("timing").path("elapsedSeconds").isNull()).isTrue();
        assertThat(end.path("timing").path("expired").asBoolean()).isFalse();
        assertLiteral(facts);
        var restored = codec.decode(mapper.readTree(encoded.toString()));
        restored.remove(ReadableSourceFacts.FIELD);
        assertThat(restored).isEqualTo(before);
        assertThat(source).isEqualTo(before);
    }

    @Test void final_and_independent_review_wire_keep_source_pairs_literal_even_with_a_false_digest() throws Exception {
        var input = helpAndPurchaseInput();
        String before = mapper.writeValueAsString(input);
        var refs = new AnalysisReferences(mapper, input);
        var falseDigest = new AiObservationDigest("우유를 담지 않았다는 잘못된 구간 해석", List.of(), List.of("일부 구간 미확인"));
        String finalText = AnalysisSynthesisPrompt.build(mapper, new AiBehaviorAnalysisPromptFactory(mapper), input,
                List.of(falseDigest), refs, false);
        var finalWire = mapper.readTree(finalText);
        var finalFacts = finalWire.path(ReadableSourceFacts.FIELD);
        assertLiteral(finalFacts);
        assertThat(cartQuantity(finalFacts.path("terminalSnapshots").get(0), "milk").asInt()).isEqualTo(2);
        assertThat(finalFacts.path("eventsById").path("E3").path("recordedProductId").asString()).isEqualTo("eggs");
        assertThat(finalFacts.path("eventsById").path("E3").path("quantityBefore").asInt()).isZero();
        assertThat(finalFacts.path("eventsById").path("E4").path("stationId").asString()).isEqualTo("fresh");
        assertThat(finalFacts.path("eventsById").path("E5").path("stationId").asString()).isEqualTo("produce");
        assertThat(finalFacts.path("eventsById").path("E6").path("recordedProductId").asString()).isEqualTo("carrot");
        String reviewText = AnalysisReviewPrompt.build(mapper, finalText, null, refs);
        var reviewWire = mapper.readTree(reviewText);
        assertThat(reviewWire.path(ReadableSourceFacts.FIELD)).isEqualTo(finalFacts);
        assertLiteral(reviewWire.path(ReadableSourceFacts.FIELD));
        assertThat(codec.decode(reviewWire).path("sourceEventDetails")).isEqualTo(codec.decode(finalWire).path("sourceEventDetails"));
        assertThat(codec.decode(reviewWire).path("evidenceReferences")).isEqualTo(codec.decode(finalWire).path("evidenceReferences"));
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
        evidence("synthetic-final-wire", finalWire);
        evidence("synthetic-review-wire", reviewWire);
    }

    @Test void legacy_generic_help_keeps_raw_action_and_micro_action_and_new_help_is_context_only() {
        var input = helpAndPurchaseInput();
        var refs = new AnalysisReferences(mapper, input);
        var observation = ObservationWireEncoding.decode(mapper,mapper.readTree(refs.encode(new AiBehaviorAnalysisPromptFactory(mapper).observationPrompt(input, input))));
        var oldGeneral = observation.path(SourceEventDetails.FIELD).get(7);
        assertThat(oldGeneral.path("eventCode").asString()).isEqualTo("SHOP.STAFF_HELP_REQUESTED");
        assertThat(oldGeneral.path("microActionId").asString()).isEqualTo("VIEWHELP");
        assertThat(oldGeneral.path("recordedAction").path("type").asString()).isEqualTo("viewHelp");
        assertThat(oldGeneral.path("recordedAction").has("station")).isFalse();
        var facts = mapper.readTree(AnalysisSynthesisPrompt.build(mapper, new AiBehaviorAnalysisPromptFactory(mapper), input,
                List.of(new AiObservationDigest("원본 관찰", List.of(), List.of())), refs, false)).path(ReadableSourceFacts.FIELD);
        assertThat(facts.path("eventsById").path("E8").path("recordedActionType").asString()).isEqualTo("viewHelp");
        assertThat(facts.path("eventsById").path("E8").path("microActionId").asString()).isEqualTo("VIEWHELP");
        assertThat(facts.path("eventsById").path("E9").path("recordedActionStation").asString()).isEqualTo("staff:employee-1");
        assertThat(facts.path("eventsById").path("E10").path("eventCode").asString()).isEqualTo("SHOP.GENERAL_HELP_OPENED");
        var registry = new BehaviorEventRegistry();
        var general = registry.find("SHOP.GENERAL_HELP_OPENED").orElseThrow();
        assertThat(general.evidencePolicy()).isEqualTo(EvidencePolicy.CONTEXT_ONLY);
        assertThat(general.actionType()).isEqualTo(CanonicalActionType.VIEW_INSTRUCTION);
        assertThat(registry.find("SHOP.STAFF_HELP_REQUESTED")).isPresent();
        assertThat(new AiBehaviorAnalysisPromptFactory(mapper).marketEventSemantics()).contains("viewHelp", "GENERAL_HELP_OPENED");
    }

    @Test void actual_instruction_history_keeps_new_general_help_and_legacy_action_scope_for_profile_and_quest() {
        var input = helpAndPurchaseInput();
        var session = input.input().sessions().getFirst().sessionId();
        var projected = oneuldo.behaviorlog.personalization.service.PracticeHistoryService.project(mapper, input, session);
        var instructions = projected.path("recordedInstructionEvents");
        assertThat(instructions.findValues("eventCode").stream().map(JsonNode::asString).toList())
                .contains("SHOP.GENERAL_HELP_OPENED", "SHOP.STAFF_HELP_REQUESTED");
        assertThat(instructions.findValues("recordedAction").stream().map(n -> n.path("type").asString()).toList())
                .contains("viewHelp", "interact");
    }

    @Test void preserved_actual_carrot_and_final_milk_source_prompts_get_a_literal_view_without_source_rewrite() throws Exception {
        var root = Path.of(System.getProperty("oneuldo.test.preserved-run", "../output/persona-hard-baseline-3-20261010"));
        assumeTrue(Files.isRegularFile(root.resolve("group-03/round-02/analysis-audit.json")), "Preserved operator fixture is optional outside this checkout");
        var originalCarrot = savedFinalSource(root.resolve("group-03/round-02/analysis-audit.json"));
        var carrotBefore = originalCarrot.deepCopy();
        var carrotWire = codec.encodeReadable(originalCarrot);
        assertActionPairs(carrotWire.path(ReadableSourceFacts.FIELD));
        assertLiteral(carrotWire.path(ReadableSourceFacts.FIELD));
        var restored = codec.decode(mapper.readTree(carrotWire.toString()));
        restored.remove(ReadableSourceFacts.FIELD);
        assertThat(restored).isEqualTo(carrotBefore);
        assertThat(originalCarrot).isEqualTo(carrotBefore);
        var originalMilk = savedFinalSource(root.resolve("group-01/round-01/analysis-audit.json"));
        var milkBefore = originalMilk.deepCopy();
        var milkWire = codec.encodeReadable(originalMilk);
        var milkSnapshots = milkWire.path(ReadableSourceFacts.FIELD).path("terminalSnapshots");
        assertThat(milkSnapshots).isNotEmpty();
        assertThat(milkSnapshots.findValues("recordedCart").stream().flatMap(n -> java.util.stream.StreamSupport.stream(n.spliterator(), false))
                .filter(n -> "milk".equals(n.path("productId").asString())).map(n -> n.path("quantity").asInt()).toList()).containsOnly(2);
        var review = mapper.readTree(AnalysisReviewPrompt.build(mapper, milkWire.toString(), null,
                new AnalysisReferences(mapper, helpAndPurchaseInput())));
        assertThat(review.path(ReadableSourceFacts.FIELD)).isEqualTo(milkWire.path(ReadableSourceFacts.FIELD));
        assertLiteral(review.path(ReadableSourceFacts.FIELD));
        assertThat(originalMilk).isEqualTo(milkBefore);
        evidence("preserved-carrot-final-wire", carrotWire);
        evidence("preserved-milk-final-wire", milkWire);
        evidence("preserved-milk-review-wire", review);
    }

    private ObjectNode savedFinalSource(Path path) throws Exception {
        var audit = mapper.readTree(Files.readString(path));
        for (int i = audit.path("attempts").size() - 1; i >= 0; i--) {
            var attempt = audit.path("attempts").get(i);
            String prompt = attempt.path("inputPrompt").asString();
            // Immutable retry attempts append diagnostic prose after the unchanged source JSON.
            // Read its first JSON value only; the full attempt text remains in the preserved audit.
            var source = codec.decode(mapper.reader().without(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(prompt));
            if (source.has(SourceEventDetails.FIELD) && source.has("taskContext")) return source;
        }
        throw new AssertionError("No preserved final source: " + path);
    }

    private void assertActionPairs(JsonNode facts) {
        var pairs = facts.path("eventsById");
        assertThat(pairs.path("E118").path("recordedProductId").asString()).isEqualTo("eggs");
        assertThat(pairs.path("E118").path("quantityBefore").asInt()).isZero();
        assertThat(pairs.path("E118").path("quantityAfter").asInt()).isEqualTo(1);
        assertThat(pairs.path("E119").path("eventCode").asString()).isEqualTo("SHOP.SHELF_CLOSED");
        assertThat(pairs.path("E119").path("stationId").asString()).isEqualTo("fresh");
        assertThat(pairs.path("E154").path("eventCode").asString()).isEqualTo("SHOP.SHELF_OPENED");
        assertThat(pairs.path("E154").path("stationId").asString()).isEqualTo("produce");
        assertThat(pairs.path("E155").path("recordedProductId").asString()).isEqualTo("carrot");
        assertThat(pairs.path("E155").path("quantityBefore").asInt()).isZero();
        assertThat(pairs.path("E155").path("quantityAfter").asInt()).isEqualTo(1);
        assertThat(pairs.path("E156").path("quantityAfter").asInt()).isEqualTo(2);
    }

    private JsonNode cartQuantity(JsonNode terminal, String product) {
        for (var item : terminal.path("recordedCart")) if (product.equals(item.path("productId").asString())) return item.get("quantity");
        throw new AssertionError("Missing recorded cart product " + product);
    }

    private void assertLiteral(JsonNode node) {
        if (node instanceof ObjectNode object) {
            assertThat(object.propertyNames()).doesNotContain("$r", "$a", "$m", "$v", "$ev", "$x", "$h", "$l", "$table");
        }
        if (node.isObject() || node.isArray()) node.forEach(this::assertLiteral);
    }

    private ObjectNode literalSource() {
        var source = mapper.createObjectNode();
        var rows = source.putArray(SourceEventDetails.FIELD);
        event(rows, "E118", 118, "SHOP.QUANTITY_CHANGED").put("itemId", "eggs").put("quantityBefore", 0).put("quantityAfter", 1)
                .putObject("selectedProduct").put("id", "eggs").put("detail", "10개입");
        event(rows, "E119", 119, "SHOP.SHELF_CLOSED").put("stationId", "fresh");
        event(rows, "E154", 154, "SHOP.SHELF_OPENED").put("stationId", "produce");
        event(rows, "E155", 155, "SHOP.QUANTITY_CHANGED").put("itemId", "carrot").put("quantityBefore", 0).put("quantityAfter", 1)
                .putObject("selectedProduct").put("id", "carrot").put("detail", "3개입");
        event(rows, "E156", 156, "SHOP.QUANTITY_CHANGED").put("itemId", "carrot").put("quantityBefore", 1).put("quantityAfter", 2);
        event(rows, "E415", 415, "SHOP.CHECKOUT_SUBMITTED").put("cartTotalAmount", 19400).putObject("cart")
                .put("milk", 2).put("banana", 1).put("instant-rice", 2).put("water", 3);
        var task = source.putArray("taskContext").addObject().put("sessionId", "S1").put("sourceEventId", "E1");
        var mission = task.putObject("mission").put("budget", 22000);
        mission.putArray("objectives").addObject().put("productId", "milk").put("quantity", 2)
                .putArray("acceptedProductIds").add("milk");
        return source;
    }

    private ObjectNode event(ArrayNode rows, String id, int sequence, String code) {
        return rows.addObject().put("id", id).put("sessionId", "S1").put("sequence", sequence).put("timeMs", sequence).put("eventCode", code);
    }

    private BehaviorAnalysisInputResponse helpAndPurchaseInput() {
        var root = new MovementProjectionTest().fixture();
        var rows = root.path("input").path("sessions").get(0).path("events");
        for (int i = 0; i < rows.size(); i++) {
            var row = (ObjectNode) rows.get(i);
            var action = (ObjectNode) row.path("action");
            var payload = (ObjectNode) row.path("payload");
            action.put("eventCode", "SHOP.SHELF_OPENED");
            payload.put("stationId", "produce");
        }
        ((ObjectNode) rows.get(0).path("action")).put("eventCode", "SHOP.SESSION_STARTED");
        var mission = ((ObjectNode) rows.get(0).path("payload").path("marketContent")).putObject("missionSnapshot").put("budget", 22000);
        mission.putArray("objectives").addObject().put("productId", "milk").put("quantity", 2).putArray("acceptedProductIds").add("milk");
        quantity(rows.get(2), "eggs", "10개입", 0, 1);
        ((ObjectNode) rows.get(3).path("action")).put("eventCode", "SHOP.SHELF_CLOSED");
        ((ObjectNode) rows.get(3).path("payload")).put("stationId", "fresh");
        quantity(rows.get(5), "carrot", "3개입", 0, 1);
        quantity(rows.get(6), "carrot", "3개입", 1, 2);
        help(rows.get(7), "SHOP.STAFF_HELP_REQUESTED", "VIEWHELP", "viewHelp", null);
        help(rows.get(8), "SHOP.STAFF_HELP_REQUESTED", "INTERACT", "interact", "staff:employee-1");
        help(rows.get(9), "SHOP.GENERAL_HELP_OPENED", "VIEWHELP", "viewHelp", null);
        ((ObjectNode) rows.get(10).path("action")).put("eventCode", "SHOP.CHECKOUT_SUBMITTED");
        ((ObjectNode) rows.get(10).path("payload")).put("cartTotalAmount", 19400);
        ((ObjectNode) rows.get(10).path("payload").path("marketContent")).putObject("cart").put("milk", 2).put("water", 3);
        return mapper.convertValue(root, BehaviorAnalysisInputResponse.class);
    }

    private void quantity(JsonNode event, String product, String detail, int before, int after) {
        ((ObjectNode) event.path("action")).put("eventCode", "SHOP.QUANTITY_CHANGED");
        var payload = (ObjectNode) event.path("payload");
        payload.put("itemId", product).put("quantityBefore", before).put("quantityAfter", after);
        ((ObjectNode) payload.path("marketContent")).putObject("item").put("id", product).put("detail", detail);
    }

    private void help(JsonNode event, String code, String micro, String type, String station) {
        ((ObjectNode) event.path("action")).put("eventCode", code).put("microActionId", micro);
        var payload = (ObjectNode) event.path("payload");
        payload.remove("stationId");
        var raw = ((ObjectNode) payload.path("marketContent")).putObject("action").put("type", type);
        if (station != null) raw.put("station", station);
    }

    private void evidence(String name, JsonNode value) throws Exception {
        String directory = System.getProperty("oneuldo.test.source-evidence-dir");
        if (directory == null) return;
        var path = Path.of(directory);
        Files.createDirectories(path);
        Files.writeString(path.resolve(name + ".json"), mapper.writeValueAsString(value));
    }
}
