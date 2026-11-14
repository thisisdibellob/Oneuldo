package oneuldo.behaviorlog.analysis;

import java.nio.file.Files;
import java.nio.file.Path;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class LiteralEventIndexTest {
    final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    ObjectNode source() {
        var source = mapper.createObjectNode();
        var rows = source.putArray(SourceEventDetails.FIELD);
        rows.addObject().put("id","E6").put("sessionId","S1").put("sequence",6).put("timeMs",178589).put("eventCode","SHOP.TIME_LIMIT_STARTED");
        rows.addObject().put("id","E312").put("sessionId","S1").put("sequence",312).put("timeMs",218320).put("eventCode","SHOP.CART_OPENED").put("cartItemCount",0)
            .putObject("replayExecutionContext").put("executionOwner","PERSONA_ACTOR").put("source","synthetic");
        rows.addObject().put("id","E395").put("sessionId","S1").put("sequence",395).put("timeMs",238736).put("eventCode","SHOP.SESSION_ENDED")
            .putObject("replayExecutionContext").put("executionOwner","SYSTEM_COMPLETION");
        source.putObject(MovementSourceContext.FIELD).putArray("sessions").addObject().put("sessionId","S1").put("providedPositionSampleEventCount",269);
        return source;
    }

    @Test void interaction_row_positions_never_replace_actual_ids_times_or_execution_owners() {
        var source = source();var before = source.deepCopy();
        var index = LiteralEventIndex.build(mapper,source);
        assertThat(index.path("eventsById").propertyNames()).containsExactly("E6","E312","E395");
        assertThat(index.at("/eventsById/E312/timeMs").asInt()).isEqualTo(218320);
        assertThat(index.at("/eventsById/E6/timeMs").asInt()).isEqualTo(178589);
        assertThat(index.at("/eventsById/E312/recordedExecutionOwner").asString()).isEqualTo("PERSONA_ACTOR");
        assertThat(index.at("/eventsById/E395/recordedExecutionOwner").asString()).isEqualTo("SYSTEM_COMPLETION");
        assertThat(index.at("/eventsById/E6").has("recordedExecutionOwner")).isFalse();
        assertThat(index.at("/movementSampleCoverage/0/providedPositionSampleEventCount").asInt()).isEqualTo(269);
        assertThat(source).isEqualTo(before);
        assertThat(index.toString()).doesNotContain("\"judgment\"","\"beforeTimeLimit\"","\"abilityScore\"");
    }

    @Test void independent_review_receives_original_order_and_owner_and_accepts_a_repair_diagnostic() {
        String source = new FinalSourceEncoding(mapper).encodeReadable(source()).toString();
        String candidate = "{\"analysis\":{\"summary\":[{\"text\":\"제한 시간 시작 전에 장바구니를 열었습니다.\",\"evidenceEventIds\":[\"E312\"]}]}}";
        var prompt = mapper.readTree(AnalysisPlanSemanticReview.prompt(mapper,source,candidate));
        assertThat(prompt.at("/sourceFacts/literalEventIndex/eventsById/E312/timeMs").asInt()).isEqualTo(218320);
        assertThat(prompt.at("/sourceFacts/literalEventIndex/eventsById/E6/timeMs").asInt()).isEqualTo(178589);
        String review = "{\"verdict\":\"REPAIR\",\"checkedDimensions\":[\"UNCERTAIN_CAUSES\"],\"issues\":[{\"code\":\"EVENT_ORDER_MISMATCH\",\"path\":\"/summary/0/text\",\"quote\":\"제한 시간 시작 전에 장바구니를 열었습니다.\",\"explanation\":\"원본 장바구니 사건은 제한 시간 시작 뒤입니다.\"}]}";
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper,review,candidate,source)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        assertThat(AnalysisPlanSemanticReview.system()).contains("EVENT_ORDER_MISMATCH","EXECUTION_OWNER_MISMATCH");
    }

    @Test void actual_cold_source_exposes_cart_312_after_timer_6_without_altering_the_encoded_original() throws Exception {
        var path=Path.of("../output/analysis-nine-cold-20261016/cases/adult-minjae-unit-support-research-v2-1-baseline-pre/input.json");
        assumeTrue(Files.exists(path));
        String raw=Files.readString(path);var input=mapper.readValue(raw,BehaviorAnalysisInput.class);
        var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
        var prompts=new AiBehaviorAnalysisPromptFactory(mapper);var refs=new AnalysisReferences(mapper,response);
        String original=prompts.observationPrompt(response,response);
        var expected=(ObjectNode)new LosslessTables(mapper).decode(mapper.readTree(refs.encode(original,false)));
        var wire=mapper.readTree(refs.encode(original));
        assertThat(wire.at("/literalEventIndex/eventsById/E312/eventCode").asString()).isEqualTo("SHOP.CART_OPENED");
        assertThat(wire.at("/literalEventIndex/eventsById/E312/sequence").asInt()).isEqualTo(312);
        assertThat(wire.at("/literalEventIndex/eventsById/E6/eventCode").asString()).isEqualTo("SHOP.TIME_LIMIT_STARTED");
        var decoded=ObservationWireEncoding.decode(mapper,wire);
        for(var value:java.util.List.of(expected,decoded))value.set("behaviorTimeline",new CompactBehaviorTimeline(mapper).decodeExpanded(value.path("behaviorTimeline")));
        assertThat(decoded).isEqualTo(expected);
        assertThat(Files.readString(path)).isEqualTo(raw);
    }
}
