package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.service.CompactBehaviorTimeline;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

class CompactBehaviorTimelineTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final CompactBehaviorTimeline codec = new CompactBehaviorTimeline(mapper);

    @Test void 원본을_건드리지않고_좌표와_맥락변경과_사건순서를_모두_복원한다() {
        ObjectNode source = mapper.createObjectNode();
        var sessions = source.putArray("sessions");
        for (int s = 0; s < 2; s++) {
            var session = sessions.addObject();
            session.put("sessionId", UUID.randomUUID().toString());
            var events = session.putArray("events");
            for (int i = 0; i < 100; i++) {
                var event = events.addObject();
                event.put("behaviorLogId", UUID.randomUUID().toString());
                event.put("sequence", i + 1);
                event.put("elapsedFromSessionStartMs", i * 250);
                event.put("occurredAt", "2026-09-05T00:00:00.123456Z");
                event.put("receivedAt", "2026-09-05T00:00:02Z");
                event.putNull("offlineQueued");
                event.putObject("task").put("gameId", "MARKET").put("difficulty", s + 1);
                event.putObject("accessibility").put("audioEnabled", i >= 50).put("controllerMode", i >= 50 ? "SWITCH" : "TOUCH");
                event.putObject("action").put("eventCode", i == 40 ? "SHOP.QUANTITY_CHANGED" : "SHOP.MOVEMENT_SAMPLED")
                        .put("microActionId", "OBSERVED");
                var payload = event.putObject("payload");
                payload.put("type", "SHOPPING"); payload.put("scenarioId", "S01");
                payload.put("x", i == 0 ? 0 : 0.123456789 + i); payload.put("y", -i);
                payload.put("blocked", false); payload.put("controlMode", i >= 50 ? "accessibility" : "joystick");
                payload.putNull("unused"); payload.put("text", ""); payload.putArray("items"); payload.putObject("emptyObject");
                payload.putArray("positionalUnknown").addNull().add(0).add(false);
                payload.putObject("marketContent").put("sceneRef", "scene-" + s).put("seed", 123);
                if (i == 40) { payload.put("quantityBefore", 0); payload.put("quantityAfter", 1); }
                if (i == 60) event.putNull("accessibility"); // Must not inherit preceding context.
            }
        }
        String before = source.toString();
        var encoded = codec.encode(source);
        assertThat(source.toString()).isEqualTo(before);
        ObjectNode expected = source.deepCopy(); CompactBehaviorTimeline.stripNulls(expected);
        assertThat(codec.decode(encoded)).isEqualTo(expected);
        var firstSession = encoded.path("sessions").get(0);
        assertThat(firstSession.path("events").size()).isEqualTo(100);
        assertThat(firstSession.path("events").get(0).isArray()).isTrue();
        assertThat(firstSession.path("events").get(40).isObject()).isTrue();
        assertThat(firstSession.path("contexts").size()).isEqualTo(3);
        assertThat(encoded.toString().length()).isLessThan(before.length());
    }

    @Test void 구간은_다른구간_문맥없이_독립적으로_해독된다() {
        var source = (ObjectNode) mapper.readTree("""
                {"sessions":[{"sessionId":"S1","events":[
                {"behaviorLogId":"E1","sequence":50,"task":{"gameId":"MARKET"},"action":{"eventCode":"SHOP.MOVEMENT_SAMPLED"},"payload":{"x":0,"y":0,"blocked":false}}
                ]}]}
                """);
        assertThat(codec.decode(codec.encode(source))).isEqualTo(source);
    }

    @Test void 문맥참조_손상은_임의로_보정하지않는다() {
        var source = (ObjectNode) mapper.readTree("{\"sessions\":[{\"events\":[{\"behaviorLogId\":\"E1\"}]}]}");
        var encoded = codec.encode(source);
        ((ObjectNode) encoded.path("sessions").get(0).path("contexts")).removeAll();
        assertThatThrownBy(() -> codec.decode(encoded)).hasMessage("Unknown context reference");
    }
    @Test void 일반_원문의_표_예약키를_인코딩_지시로_오인하지_않는다() {
        var source=(ObjectNode)mapper.readTree("""
                {"sessions":[{"events":[{"behaviorLogId":"E1","payload":{"marketContent":{"$table":["원문"],"rows":"값","$literal":null}}}]}]}
                """);
        var expected=source.deepCopy();CompactBehaviorTimeline.stripNulls(expected);
        assertThat(codec.decode(codec.encode(source))).isEqualTo(expected);
        var tableLayer=new oneuldo.behaviorlog.analysis.service.LosslessTables(mapper).encode(codec.encode(source));
        assertThat(codec.decodeWithTables(tableLayer)).isEqualTo(expected);
    }
}
