package oneuldo.behaviorlog.analysis;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MovementProjectionTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    ObjectNode fixture() {
        var root=mapper.createObjectNode().put("id",UUID.randomUUID().toString()).put("schemaVersion","test")
                .put("generatedAt","2026-09-07T00:00:00Z").put("sessionCount",1).put("eventCount",12);
        var input=root.putObject("input");input.put("datasetId",root.path("id").asString());input.put("schemaVersion","test");
        input.put("generatedAt","2026-09-07T00:00:00Z");input.put("sessionCount",1);input.put("eventCount",12);
        var session=input.putArray("sessions").addObject().put("sessionId",UUID.randomUUID().toString());
        var events=session.putArray("events");
        for(int i=0;i<12;i++) {
            var e=events.addObject().put("behaviorLogId",UUID.randomUUID().toString()).put("sequence",i+1).put("elapsedFromSessionStartMs",i*100);
            e.put("occurredAt","2026-09-07T00:00:01Z");e.put("receivedAt","2026-09-07T00:00:02Z");
            e.putObject("action").put("eventCode","SHOP.MOVEMENT_SAMPLED");
            var p=e.putObject("payload").put("type","SHOPPING").put("x",i*10).put("y",0).put("blocked",false).put("controlMode","joystick");
            var context=p.putObject("marketContent").put("sceneRef","SC1").putObject("movementContext");
            context.put("coordinateSpace","market-world").put("interactionRadius",105);
            context.putObject("stations").putObject("far").put("x",1000).put("y",1000);
        }
        return root;
    }
    BehaviorAnalysisInputResponse input(ObjectNode root) {return mapper.convertValue(root,BehaviorAnalysisInputResponse.class);}
    @Test void zero_tolerance_and_legacy_coordinates_preserve_all_events() {
        var root=fixture();assertThat(new MovementProjection(mapper,input(root),0).visible().eventCount()).isEqualTo(12);
        root.path("input").path("sessions").get(0).path("events").forEach(e->((ObjectNode)e.path("payload").path("marketContent")).remove("movementContext"));
        assertThat(new MovementProjection(mapper,input(root),1).visible().eventCount()).isEqualTo(12);
    }
    @Test void mapping_is_exact_and_unknown_segments_are_rejected() {
        var original=input(fixture());var projection=new MovementProjection(mapper,original,0.1);
        assertThat(projection.visible().eventCount()).isEqualTo(2);
        assertThat(projection.segments()).hasSize(1);
        assertThat(projection.expand(List.of(projection.segments().getFirst().segmentId()))).isEqualTo(original);
        assertThatThrownBy(()->projection.expand(List.of(UUID.randomUUID()))).hasMessage("UNKNOWN_MOVEMENT_SEGMENT");
    }
    @Test void interactions_and_neighbors_are_preserved_and_gaps_split_runs() {
        var root=fixture();var events=root.path("input").path("sessions").get(0).path("events");
        ((ObjectNode)events.get(5).path("action")).put("eventCode","SHOP.QUANTITY_CHANGED");
        ((ObjectNode)events.get(9)).put("sequence",99);
        var projection=new MovementProjection(mapper,input(root),0.1);
        var sequences=projection.visible().input().sessions().getFirst().events().stream().map(BehaviorAnalysisInput.EventTimeline::sequence).toList();
        assertThat(sequences).contains(5L,6L,7L,9L,99L,11L);
    }
    @Test void station_neighborhood_is_never_approximated() {
        var root=fixture();root.path("input").path("sessions").get(0).path("events").forEach(e->{
            ((ObjectNode)e.path("payload").path("marketContent").path("movementContext").path("stations").path("far")).put("x",50).put("y",0);
        });
        assertThat(new MovementProjection(mapper,input(root),10).visible().eventCount()).isEqualTo(12);
    }
    @Test void requested_raw_segment_is_sent_and_only_visible_evidence_is_accepted() {
        var source=input(fixture());var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        ReflectionTestUtils.setField(factory,"movementMaxError",0.1);
        var client=mock(GroqChatClient.class, inv -> inv.getMethod().getName().equals("completeDigest")
                ? inv.callRealMethod() : org.mockito.Answers.RETURNS_DEFAULTS.answer(inv));var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(inv->{
            var root=new LosslessTables(mapper).decode(mapper.readTree(inv.getArgument(1,String.class).split("\\n구간 ")[0]));
            boolean initial=root.path("movementSegments").size()>0;
            var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
            assertThat(timeline.path("sessions").get(0).path("events").size()).isEqualTo(initial?2:12);
            return new GroqChatClient.GroqChatResult("{\"summary\":\"관측\",\"observations\":[],\"uncertainties\":[\"확인 필요\"],\"requestedSegmentIds\":"+(initial?"[\"E1\"]":"[]")+"}","test");
        });
        var pipeline=new TimelineAnalysisPipeline(factory,validator,client,mapper);
        AiObservationDigest digest=ReflectionTestUtils.invokeMethod(pipeline,"observe",source,source,new AnalysisReferences(mapper,source),1,1,7000,new ArrayList<AiBehaviorAnalysisRun.Attempt>());
        assertThat(digest.requestedSegmentIds()).isEmpty();
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
        var hidden=source.input().sessions().getFirst().events().get(3).behaviorLogId();
        var invalid=new AiObservationDigest("summary",List.of(new AiObservationDigest.Observation("x","y",List.of("z"),List.of(hidden))),List.of("u"));
        assertThatThrownBy(()->validator.validateDigest(invalid,factory.movementProjection(source).visible())).isInstanceOf(IllegalArgumentException.class);
    }
}
