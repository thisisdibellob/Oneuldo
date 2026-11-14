package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class MarketTimingSourceContractTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final String STARTED_AT = "2026-10-10T00:00:11Z";
    private static final int SECONDS = 300;

    @Test void actual_clock_and_deadline_state_survive_observation_aliases_final_and_independent_review() {
        var input = input(timedFixture());
        var before = mapper.writeValueAsString(input);
        var details = SourceEventDetails.build(mapper, input);
        var started = event(details, "SHOP.TIME_LIMIT_STARTED");
        var expired = event(details, "SHOP.TIME_LIMIT_EXPIRED");
        assertThat(started.path("timing").path("elapsedMs").asLong()).isZero();
        assertThat(started.path("timeMs").asLong()).isEqualTo(11_000);
        assertThat(started.path("timing").path("expired").asBoolean()).isFalse();
        assertThat(expired.path("timing").path("remainingMs").asLong()).isZero();
        assertThat(expired.path("timing").path("elapsedMs").asLong()).isEqualTo(300_000);
        assertThat(expired.path("timing").path("startedAt").asString()).isEqualTo(STARTED_AT);
        assertThat(expired.path("timing").path("expired").asBoolean()).isTrue();
        assertThat(expired.path("cart")).isEqualTo(mapper.readTree("{\"milk-small\":1,\"unrecorded-sku\":1}"));
        assertThat(expired.path("missionSnapshot")).isEqualTo(mission(true));
        assertThat(expired.path("objectiveProgress")).isEqualTo(mapper.readTree("[{\"productId\":\"milk\",\"selectedQuantity\":0,\"requiredQuantity\":1,\"complete\":false}]"));
        assertThat(event(details, "SHOP.SESSION_ENDED").path("sessionEnd").path("reason").asString()).isEqualTo("TIME_LIMIT_EXPIRED");

        var source = mapper.createObjectNode().set(SourceEventDetails.FIELD, details);
        var tables = new LosslessTables(mapper);
        var codec = new FinalSourceEncoding(mapper);
        assertThat(tables.decode(tables.encode(source))).isEqualTo(source);
        assertThat(codec.decode(tables.encode(codec.encode(source)))).isEqualTo(source);

        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var refs = new AnalysisReferences(mapper, input);
        var expected = mapper.readTree(refs.encode(mapper.writeValueAsString(source))).path(SourceEventDetails.FIELD);
        var observation = ObservationWireEncoding.decode(mapper,mapper.readTree(refs.encode(prompts.observationPrompt(input, input))));
        assertThat(observation.path("promptVersion").asString()).isEqualTo(AiBehaviorAnalysisPromptFactory.OBSERVATION_VERSION);
        assertThat(observation.path(SourceEventDetails.FIELD)).isEqualTo(expected);
        var synthesis = AnalysisSynthesisPrompt.build(mapper, prompts, input,
                List.of(new AiObservationDigest("시간 원본 외에는 미해석", List.of(), List.of("원인 미확인"))), refs, false);
        var finalSource = codec.decode(mapper.readTree(synthesis));
        var review = codec.decode(mapper.readTree(AnalysisReviewPrompt.build(mapper, synthesis, null, refs)));
        for (var wire : List.of(finalSource, review)) {
            assertThat(wire.path(SourceEventDetails.FIELD)).isEqualTo(expected);
            assertThat(wire.path("taskContext").get(0).path("mission")).isEqualTo(mission(true));
            assertThat(wire.path("evidenceReferences").toString()).contains("E1", "E9", "E12");
            assertThat(event(wire.path(SourceEventDetails.FIELD), "SHOP.TIME_LIMIT_STARTED").path("timing")).isEqualTo(wireValue(started.path("timing")));
            assertThat(event(wire.path(SourceEventDetails.FIELD), "SHOP.TIME_LIMIT_EXPIRED").path("missionSnapshot")).isEqualTo(expired.path("missionSnapshot"));
            assertThat(wire.path(SourceEventDetails.FIELD).findValues("eventCode").stream().map(JsonNode::asString).toList())
                    .doesNotContain("SHOP.CHECKOUT_SUBMITTED");
        }
        assertThat(finalSource.path("synthesisVersion").asString()).isEqualTo(AnalysisSynthesisPrompt.VERSION);
        assertThat(review.path("reviewVersion").asString()).isEqualTo(AnalysisReviewPrompt.VERSION);
        assertThat(AnalysisReviewPrompt.system()).contains(
                "Timing starts at TIME_LIMIT_STARTED, excluding briefing/generation/analysis",
                "WALL_CLOCK includes later background time",
                "Expiry cart is a termination snapshot, not checkout",
                "Missing old timing is unknown, never a default or inferred timeout",
                "Speed, repetition, help or timeout alone do not establish deficits, learning");
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
    }

    @Test void legacy_without_clock_source_does_not_gain_zero_default_limit_or_timeout_history() {
        var data = timedFixture();
        var events = events(data);
        for (var event : events) ((ObjectNode) event.path("payload")).remove("timing");
        ((ObjectNode) events.get(0).path("action")).put("eventCode", "SHOP.SESSION_STARTED");
        ((ObjectNode) events.get(0).path("payload").path("marketContent").path("sceneSnapshot")).set("mission", mission(false));
        ((ObjectNode) events.get(8).path("action")).put("eventCode", "SHOP.CART_OPENED");
        ((ObjectNode) events.get(8).path("payload").path("marketContent")).remove(List.of("missionSnapshot", "objectiveProgress"));
        ((ObjectNode) events.get(11).path("sessionEnd")).put("reason", "USER_ABORTED");
        var input = input(data);
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var refs = new AnalysisReferences(mapper, input);
        var source = AnalysisSynthesisPrompt.build(mapper, prompts, input, List.of(), refs, false);
        var codec = new FinalSourceEncoding(mapper);
        for (var wire : List.of(codec.decode(mapper.readTree(source)), codec.decode(mapper.readTree(AnalysisReviewPrompt.build(mapper, source, null, refs))))) {
            assertThat(wire.path(SourceEventDetails.FIELD).findValues("timing")).isEmpty();
            assertThat(wire.path(SourceEventDetails.FIELD).findValues("elapsedMs")).isEmpty();
            assertThat(wire.path(SourceEventDetails.FIELD).findValues("remainingMs")).isEmpty();
            assertThat(wire.path("taskContext").get(0).path("mission").has("timeLimitSeconds")).isFalse();
        }
        var practice = practice(input);
        assertThat(practice.path("timingEvents").isEmpty()).isTrue();
        var history = history(practice);
        var quest = QuestPracticeHistoryContext.project(mapper, history).get(0).path("recordedPractice");
        assertThat(quest.has("timeLimitExpiredEvents")).isFalse();
        assertThat(quest.has("timedOutProductDetails")).isFalse();
        assertThat(quest.path("purchaseEvents").isEmpty()).isTrue();
        var profile = mapper.readTree(new AiUserProfilePromptFactory(mapper).withPracticeHistory("{}", history));
        var comparison = profile.path("currentTaskComparisonSource").get(0);
        assertThat(comparison.path("requirements").get(0).has("timeLimitSeconds")).isFalse();
        assertThat(comparison.path("timingEvents").isEmpty()).isTrue();
        assertThat(comparison.path("timeLimitExpiredEvents").isEmpty()).isTrue();
    }

    @Test void timeout_history_keeps_actual_clock_and_recorded_sku_labels_without_inventing_a_submission() {
        var input = input(timedFixture());
        var practice = practice(input);
        var before = practice.deepCopy();
        var history = history(practice);
        assertThat(practice.path("timingEvents").size()).isEqualTo(3);
        assertThat(event(practice.path("timingEvents"), "SHOP.TIME_LIMIT_STARTED").path("timing").path("elapsedMs").asLong()).isZero();
        for (var timingEvent : practice.path("timingEvents")) assertThat(timingEvent.has("id")).isFalse();
        var quest = QuestPracticeHistoryContext.project(mapper, history).get(0).path("recordedPractice");
        assertThat(quest.path("purchaseEvents").isEmpty()).isTrue();
        assertThat(quest.path("submittedProductDetails").isEmpty()).isTrue();
        assertThat(quest.path("timeLimitExpiredEvents").size()).isEqualTo(1);
        assertThat(quest.path("timeLimitExpiredEvents").get(0)).isEqualTo(event(practice.path("purchaseEvents"), "SHOP.TIME_LIMIT_EXPIRED"));
        assertThat(quest.path("timingEvents")).isEqualTo(practice.path("timingEvents"));
        assertThat(quest.path("timedOutProductDetails").size()).isEqualTo(1);
        var recorded = quest.path("timedOutProductDetails").get(0);
        assertThat(recorded.path("productId").asString()).isEqualTo("milk-small");
        assertThat(recorded.path("product")).isEqualTo(selectedProduct("milk-small", "기록된 작은 우유", "200mL", "팩"));
        assertThat(recorded.path("sequence").asInt()).isEqualTo(3);
        assertThat(quest.path("timedOutProductDetails").toString()).doesNotContain("unrecorded-sku", "사과", "900mL");

        var profileFactory = new AiUserProfilePromptFactory(mapper);
        var profileInput = mapper.createObjectNode().put("promptVersion", AiUserProfilePromptFactory.VERSION);
        var profile = mapper.readTree(profileFactory.withPracticeHistory(profileInput.toString(), history));
        var comparison = profile.path("currentTaskComparisonSource").get(0);
        assertThat(comparison.path("requirements").get(0).path("timeLimitSeconds").asInt()).isEqualTo(SECONDS);
        assertThat(comparison.path("submissions").isEmpty()).isTrue();
        assertThat(comparison.path("timeLimitExpiredEvents").get(0)).isEqualTo(wireValue(quest.path("timeLimitExpiredEvents").get(0)));
        assertThat(comparison.path("timingEvents")).isEqualTo(wireValue(practice.path("timingEvents")));
        assertThat(LosslessHistoryEncoding.decodeHistory(mapper, profile).get(0).path("recordedPractice")).isEqualTo(wireValue(practice));
        assertThat(profile.path("promptVersion").asString()).isEqualTo(AiUserProfilePromptFactory.VERSION);
        assertThat(practice).isEqualTo(before);
    }

    private ObjectNode timedFixture() {
        var root = new MovementProjectionTest().fixture();
        var events = events(root);
        var sessionStart = java.time.Instant.parse("2026-10-10T00:00:00Z");
        for (int index = 0; index < events.size(); index++) {
            var event = (ObjectNode) events.get(index);
            long elapsed = index < 8 ? 11_000L + index * 30_000L : 311_000L;
            event.put("elapsedFromSessionStartMs", elapsed);
            event.put("occurredAt", sessionStart.plusMillis(elapsed).toString());
            event.put("receivedAt", sessionStart.plusMillis(elapsed + 1000).toString());
        }
        var started = (ObjectNode) events.get(0);
        started.put("elapsedFromSessionStartMs", 11_000);
        ((ObjectNode) started.path("action")).put("eventCode", "SHOP.TIME_LIMIT_STARTED");
        ((ObjectNode) started.path("payload")).set("timing", timing(0, 300_000, false));
        ((ObjectNode) started.path("payload").path("marketContent")).putObject("sceneSnapshot").set("mission", mission(true));
        var selected = (ObjectNode) events.get(2);
        ((ObjectNode) selected.path("action")).put("eventCode", "SHOP.QUANTITY_CHANGED");
        var payload = (ObjectNode) selected.path("payload");
        payload.put("itemId", "milk-small").put("quantityBefore", 0).put("quantityAfter", 1);
        ((ObjectNode) payload.path("marketContent")).set("item", selectedProduct("milk-small", "기록된 작은 우유", "200mL", "팩"));
        var other = (ObjectNode) events.get(4);
        ((ObjectNode) other.path("action")).put("eventCode", "SHOP.QUANTITY_CHANGED");
        ((ObjectNode) other.path("payload").path("marketContent")).set("item", selectedProduct("apple", "기록된 사과", "1개", "개"));
        var expiration = (ObjectNode) events.get(8);
        expiration.put("elapsedFromSessionStartMs", 311_000);
        ((ObjectNode) expiration.path("action")).put("eventCode", "SHOP.TIME_LIMIT_EXPIRED");
        ((ObjectNode) expiration.path("payload")).set("timing", timing(300_000, 0, true));
        var content = (ObjectNode) expiration.path("payload").path("marketContent");
        content.set("cart", mapper.readTree("{\"milk-small\":1,\"unrecorded-sku\":1}"));
        content.set("missionSnapshot", mission(true));
        content.set("objectiveProgress", mapper.readTree("[{\"productId\":\"milk\",\"selectedQuantity\":0,\"requiredQuantity\":1,\"complete\":false}]"));
        var ended = (ObjectNode) events.get(11);
        ended.put("elapsedFromSessionStartMs", 311_000);
        ((ObjectNode) ended.path("action")).put("eventCode", "SHOP.SESSION_ENDED");
        ended.putObject("sessionEnd").put("reason", "TIME_LIMIT_EXPIRED").put("interruptionCount", 0).put("interruptionTimeMs", 0);
        ((ObjectNode) ended.path("payload")).set("timing", timing(300_000, 0, true));
        return root;
    }

    private ObjectNode mission(boolean timed) {
        var mission = mapper.createObjectNode().put("id", "market-ai-timing-fixture").put("budget", 5000);
        if (timed) mission.put("timeLimitSeconds", SECONDS);
        var objective = mission.putArray("objectives").addObject().put("productId", "milk").put("quantity", 1).put("name", "흰 우유 900mL");
        objective.putArray("acceptedProductIds").add("milk");
        mission.putArray("briefing").add("흰 우유 900mL 1개를 골라요.");
        mission.putArray("checkoutDialogue").add("제출할 수 있어요.").add("계속 장볼 수 있어요.");
        return mission;
    }

    private ObjectNode timing(long elapsed, long remaining, boolean expired) {
        return mapper.createObjectNode().put("timeLimitSeconds", SECONDS).put("policyVersion", MarketQuestTimePolicy.VERSION)
                .put("startedAt", STARTED_AT).put("elapsedMs", elapsed).put("remainingMs", remaining).put("expired", expired).put("clockBasis", "WALL_CLOCK");
    }

    private ObjectNode selectedProduct(String id, String name, String detail, String unit) {
        return mapper.createObjectNode().put("id", id).put("name", name).put("detail", detail).put("salesUnit", unit);
    }

    private BehaviorAnalysisInputResponse input(ObjectNode fixture) {
        return mapper.convertValue(fixture, BehaviorAnalysisInputResponse.class);
    }

    /** JSON integer values are preserved even when the parser chooses IntNode for a boxed Long. */
    private JsonNode wireValue(JsonNode source) {
        return mapper.readTree(mapper.writeValueAsString(source));
    }

    private ArrayNode events(ObjectNode fixture) {
        return (ArrayNode) fixture.path("input").path("sessions").get(0).path("events");
    }

    private JsonNode event(JsonNode events, String code) {
        for (var event : events) if (code.equals(event.path("eventCode").asString())) return event;
        throw new AssertionError("Missing source event: " + code);
    }

    private ObjectNode practice(BehaviorAnalysisInputResponse input) {
        return PracticeHistoryService.project(mapper, input, input.input().sessions().getFirst().sessionId());
    }

    private ArrayNode history(ObjectNode practice) {
        var history = mapper.createArrayNode();
        history.addObject().put("currentSession", true).put("playOrder", 1).set("recordedPractice", practice);
        return history;
    }
}
