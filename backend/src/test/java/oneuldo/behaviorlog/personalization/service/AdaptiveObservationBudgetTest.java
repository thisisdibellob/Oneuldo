package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import oneuldo.ai.exception.AiInputLimitException;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class AdaptiveObservationBudgetTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    @Test void actual_488_event_source_fits_in_two_parts_without_losing_or_rounding_any_position() throws Exception {
        var run=Path.of("../output/adaptive-five-fixes-20261012");
        var input=mapper.treeToValue(mapper.readTree(Files.readString(run.resolve("auditor/input-snapshots.json"))).get(0).path("input_data"),BehaviorAnalysisInput.class);
        var source=AdaptiveQuestEvidence.build(mapper,input);var before=source.deepCopy();
        var parts=AdaptiveQuestObservation.plan(mapper,source,readable(source),24000);
        assertThat(parts).hasSize(2);
        var restored=mapper.createArrayNode();var report=mapper.createArrayNode();
        for(var part:parts) {
            assertThat(part.requiredTokens()).isLessThanOrEqualTo(24000);
            var decoded=new FinalSourceEncoding(mapper).decode(mapper.readTree(part.prompt()));
            if(decoded.has("eventColumnEncoding"))decoded.set("events",new LosslessEventColumns(mapper).decodeValues(decoded.path("events")));
            decoded.path("events").forEach(restored::add);
            for(String field:List.of("sourceEventDetails","navigationContext","recordedTasks","eventColumns","eventCount"))
                assertThat(decoded.path(field)).isEqualTo(source.path(field));
            report.addObject().put("part",parts.indexOf(part)+1).put("providedPositionRows",decoded.path("events").size()).put("requiredTokens",part.requiredTokens());
        }
        assertThat(restored).isEqualTo(source.path("events"));
        assertThat(restored).hasSize(349);assertThat(source).isEqualTo(before);
        Files.writeString(run.resolve("observation-part-budget-check.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }
    @Test void short_sources_stay_in_one_call_and_unfit_sources_fail_without_silently_dropping_records(){
        var source=mapper.createObjectNode();source.putArray("events");source.putArray("sourceEventDetails");source.put("original","기록을 그대로 유지해요");
        assertThat(AdaptiveQuestObservation.plan(mapper,source,mapper.createArrayNode(),24000)).hasSize(1);
        var before=source.deepCopy();
        assertThatThrownBy(()->AdaptiveQuestObservation.plan(mapper,source,mapper.createArrayNode(),100)).isInstanceOf(AiInputLimitException.class);
        assertThat(source).isEqualTo(before);
        assertThat(AdaptiveQuestContract.MAXIMUM_AI_CALLS).isEqualTo(6);
        assertThat(AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS).isEqualTo(420);
    }
    private JsonNode readable(ObjectNode source){
        var rows=mapper.createArrayNode();for(var e:source.path("sourceEventDetails")){
            var row=rows.addArray();for(String field:List.of("id","eventCode","timeMs","itemId","quantityBefore","quantityAfter"))row.add(e.has(field)?e.get(field):mapper.nullNode());
            row.add(e.path("recordedAction").path("type").asString(""));row.add(e.path("stationId").asString(""));
        }return rows;
    }
}
