package oneuldo.behaviorlog.analysis;

import java.util.List;
import oneuldo.behaviorlog.analysis.domain.AiObservationDigest;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class MovementSourceContextTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    private BehaviorAnalysisInputResponse fixture() {
        var root = new MovementProjectionTest().fixture();
        var events = root.path("input").path("sessions").get(0).path("events");
        for (var event : events) {
            var content = (ObjectNode) event.path("payload").path("marketContent");
            content.put("controlSource", "AGENT").put("layoutVersion", "recorded-corner-v3");
            content.putObject("agentContext").put("personaId", "fixture").put("agentModel", "test");
            ((ObjectNode) content.path("movementContext")).put("samplingVersion", "market-movement-v2")
                    .put("maxIntervalMs", 1000).put("samplingRule", "preserve reversals; gaps are unknown");
        }
        String[] codes = { "SHOP.SESSION_STARTED", "SHOP.MOVEMENT_SAMPLED", "SHOP.MOVEMENT_SAMPLED", "SHOP.MOVEMENT_SAMPLED",
                "SHOP.ROUTE_LOOP_DETECTED", "SHOP.MOVEMENT_BLOCKED", "SHOP.MOVEMENT_UNBLOCKED", "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
                "SHOP.SHELF_OPENED", "SHOP.QUANTITY_CHANGED", "SHOP.CHECKOUT_SUBMITTED", "SHOP.SESSION_ENDED" };
        for (int i = 0; i < codes.length; i++) ((ObjectNode) events.get(i).path("action")).put("eventCode", codes[i]);
        var scene = ((ObjectNode) events.get(0).path("payload").path("marketContent")).putObject("sceneSnapshot");
        scene.put("layoutVersion", "recorded-corner-v3").put("seed", 17);
        var application = scene.putObject("environmentPlanApplication").put("applied", false);
        application.putArray("requestedShelfOrder").add("produce").add("fresh");
        application.putArray("actualShelfOrder").add("fresh").add("produce");
        scene.putObject("mission").putArray("objectives").addObject().put("productId", "milk").put("quantity", 1);
        var geometry = mapper.createObjectNode();
        geometry.putObject("config").put("layoutId", "corner").putArray("shelfOrder").add("fresh").add("produce");
        geometry.putObject("shelves").putObject("fresh").put("slotId", "northwest").put("orientation", "horizontal")
                .put("x", 200.5).put("y", 320.25).putObject("point").put("x", 230).put("y", 340);
        geometry.putObject("stations").putObject("fresh").put("x", 230).put("y", 340);
        geometry.putArray("obstacles").addObject().put("x", 100).put("y", 100).put("width", 30).put("height", 40);
        geometry.putArray("customers").addObject().put("id", "C1").putObject("collider").put("x", 120).put("y", 150);
        scene.putObject("startingConditions").put("geometry", mapper.writeValueAsString(geometry))
                .putArray("supportOptions").add("목록 다시 보기");
        ((ObjectNode) events.get(4).path("payload")).putArray("stationSequence").add("fresh").add("produce").add("fresh");
        ((ObjectNode) events.get(5).path("payload")).put("blocked", true);
        ((ObjectNode) events.get(6).path("payload")).put("blocked", false).put("durationMs", 0);
        ((ObjectNode) events.get(7).path("payload")).put("pathDistance", 140).put("straightDistance", 80);
        ((ObjectNode) events.get(8).path("payload")).put("stationId", "fresh");
        return mapper.convertValue(root, BehaviorAnalysisInputResponse.class);
    }

    @Test void source_projection_preserves_layout_route_and_input_conditions_without_a_wandering_verdict() {
        var input = fixture();
        String before = mapper.writeValueAsString(input);
        var source = MovementSourceContext.build(mapper, input);
        var session = source.path("sessions").get(0);
        assertThat(session.path("providedPositionSampleEventCount").asInt()).isEqualTo(3);
        assertThat(session.path("collectorContexts").size()).isEqualTo(1);
        assertThat(session.path("collectorContexts").get(0).path("controlSource").asString()).isEqualTo("AGENT");
        assertThat(session.path("collectorContexts").get(0).path("movementContext").path("maxIntervalMs").asInt()).isEqualTo(1000);
        var geometry = session.path("sceneSources").get(0).path("recordedGeometry");
        assertThat(session.path("sceneSources").get(0).path("environmentPlanApplication").path("applied").asBoolean()).isFalse();
        assertThat(session.path("sceneSources").get(0).path("environmentPlanApplication").path("actualShelfOrder").toString())
                .isEqualTo(geometry.path("config").path("shelfOrder").toString());
        assertThat(geometry.path("config").path("layoutId").asString()).isEqualTo("corner");
        assertThat(geometry.path("shelves").path("fresh").path("x").asDouble()).isEqualTo(200.5);
        assertThat(geometry.has("stations")).isFalse();
        assertThat(geometry.path("scope").asString()).contains("collectorContexts.movementContext.stations", "obstacles");
        assertThat(geometry.path("obstacles").size()).isEqualTo(1);
        assertThat(geometry.path("customers").get(0).path("collider").path("x").asInt()).isEqualTo(120);
        var details = session.path("movementEventDetails");
        assertThat(details.size()).isEqualTo(5);
        assertThat(details.get(0).path("stationSequence").toString()).isEqualTo("[\"fresh\",\"produce\",\"fresh\"]");
        assertThat(details.get(2).path("durationMs").asInt()).isZero();
        assertThat(details.get(3).path("pathDistance").asInt()).isEqualTo(140);
        assertThat(details.get(0).has("durationMs")).isFalse();
        assertThat(source.has("judgment")).isFalse();
        assertThat(source.toString()).doesNotContain("wanderingCount", "abilityScore", "pathEfficiency");
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
    }

    @Test void independent_final_review_can_recheck_a_route_claim_against_original_events_and_geometry() {
        var input = fixture();
        var route = input.input().sessions().getFirst().events().get(4);
        var digest = new AiObservationDigest("이동 기록이 많음", List.of(new AiObservationDigest.Observation(
                "길을 잃었다", "능력 부족", List.of(), List.of(route.behaviorLogId()))), List.of("동적 상태 미기록"));
        var factory = new AiBehaviorAnalysisPromptFactory(mapper);
        var refs = new AnalysisReferences(mapper, input);
        String synthesis = AnalysisSynthesisPrompt.build(mapper, factory, input, List.of(digest), refs, false);
        var source = new FinalSourceEncoding(mapper).decode(mapper.readTree(synthesis));
        var movement = source.path(MovementSourceContext.FIELD).path("sessions").get(0);
        assertThat(movement.path("movementEventDetails").get(0).path("id").asString()).isEqualTo("E5");
        assertThat(source.path("evidenceReferences").toString()).contains("E5", "E6", "E7", "E8", "E9");
        var reviewed = new FinalSourceEncoding(mapper).decode(mapper.readTree(AnalysisReviewPrompt.build(mapper, synthesis, null, refs)));
        assertThat(reviewed.path(MovementSourceContext.FIELD)).isEqualTo(source.path(MovementSourceContext.FIELD));
        assertThat(reviewed.path("chunkAnalyses").get(0).path("observations").isEmpty()).isTrue();
        assertThat(reviewed.path("chunkAnalyses").get(0).path("localLimitationsToRecheck").toString()).contains("동적 상태 미기록");
    }

    @Test void observation_keeps_the_original_map_once_and_does_not_duplicate_all_movement_values() {
        var input = fixture();
        var factory = new AiBehaviorAnalysisPromptFactory(mapper);
        var source = new LosslessTables(mapper).decode(mapper.readTree(factory.observationPrompt(input, input)));
        var context = source.path(MovementSourceContext.FIELD).path("sessions").get(0);
        assertThat(context.path("providedPositionSampleEventCount").asInt()).isEqualTo(3);
        assertThat(context.has("movementEventDetails")).isFalse();
        assertThat(context.path("sceneSources").get(0).has("recordedGeometry")).isFalse();
        var timeline = new CompactBehaviorTimeline(mapper).decodeExpanded(source.path("behaviorTimeline"));
        assertThat(timeline.path("sessions").get(0).path("events").get(0).path("payload").path("marketContent")
                .path("sceneSnapshot").path("startingConditions").path("geometry").asString()).contains("corner", "obstacles", "customers");
        assertThat(timeline.path("sessions").get(0).path("events").size()).isEqualTo(12);
    }

    @Test void history_context_keeps_source_values_without_granting_new_citations_or_inventing_missing_geometry() {
        var input = fixture();
        var session = input.input().sessions().getFirst();
        var history = MovementSourceContext.forSession(mapper, input, session.sessionId());
        assertThat(history.has("movementEventDetails")).isFalse();
        assertThat(history.path("sceneSources").get(0).has("sourceEventId")).isFalse();
        assertThat(history.path("sceneSources").get(0).has("mission")).isFalse();
        assertThat(history.path("sceneSources").get(0).has("slots")).isFalse();
        assertThat(history.path("sceneSources").get(0).path("recordedGeometry").path("config").path("layoutId").asString()).isEqualTo("corner");
        assertThat(history.path("sceneSources").get(0).path("recordedGeometry").path("shelves").path("fresh").path("x").asDouble()).isEqualTo(200.5);
        assertThat(history.path("sceneSources").get(0).path("recordedGeometry").has("obstacles")).isFalse();
        assertThat(history.path("sceneSources").get(0).path("recordedGeometry").has("customers")).isFalse();
        assertThat(history.path("scopeVersion").asString()).isEqualTo("navigation-layout-history-v1");
        assertThat(MovementSourceContext.HISTORY_SCOPE).contains("이동 사건", "장애물·NPC", "최적 경로", "확정하지 않는다");
        var tree = (ObjectNode) mapper.valueToTree(input);
        var conditions = (ObjectNode) tree.path("input").path("sessions").get(0).path("events").get(0)
                .path("payload").path("marketContent").path("sceneSnapshot").path("startingConditions");
        conditions.put("geometry", "legacy fixed fixtures");
        var legacy = MovementSourceContext.build(mapper, mapper.convertValue(tree, BehaviorAnalysisInputResponse.class))
                .path("sessions").get(0).path("sceneSources").get(0);
        assertThat(legacy.has("recordedGeometry")).isFalse();
        assertThat(legacy.path("startingConditions").path("geometry").asString()).isEqualTo("legacy fixed fixtures");
    }
}
