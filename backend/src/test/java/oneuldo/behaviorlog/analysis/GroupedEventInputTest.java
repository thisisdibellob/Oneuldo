package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import oneuldo.behaviorlog.analysis.service.*;
import static org.assertj.core.api.Assertions.assertThat;

class GroupedEventInputTest {
    @Test void retainsOrderAndEveryValueAcrossGroupsAndSessions() {
        var mapper=JsonMapper.builder().build();
        var source=(ObjectNode)mapper.readTree("""
            {"sessions":[{"sessionId":"S1","events":[
              {"sequence":3,"action":{"eventCode":"A"},"payload":{"x":0,"y":1.123456789,"a/b":{"~":null},"flag":false}},
              {"sequence":1,"action":{"eventCode":"B"},"payload":{"x":null,"empty":{},"array":[0,false,null]}},
              {"sequence":3,"action":{"eventCode":"A"},"payload":{"x":0,"y":2.987654321,"a/b":{"~":null},"flag":false}}
            ]},{"sessionId":"S2","events":[]},{"sessionId":"S3","events":[{"action":{"eventCode":"A"},"payload":null}]}]}
            """);
        var codec=new GroupedEventInput(mapper);
        var tables=new LosslessTables(mapper);
        var encoded=codec.encode(source);
        assertThat(codec.decode((ObjectNode)tables.decode(tables.encode(encoded)))).isEqualTo(source);
        assertThat(source.path("sessions").get(0).path("events").get(0).path("sequence").asInt()).isEqualTo(3);
    }
}
