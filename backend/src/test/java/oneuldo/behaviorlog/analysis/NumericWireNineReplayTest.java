package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;

/** Transport-only replay; deliberately makes zero model calls and no quality/latency claims. */
@EnabledIfEnvironmentVariable(named="AI_NUMERIC_NINE_REPLAY",matches="true")
class NumericWireNineReplayTest {
    @Test void everyOldObservationRequestRestoresExactlyWithoutMissingEvents()throws Exception {
        var m=JsonMapper.builder().findAndAddModules().build();
        var old=Path.of("../output/grounded-profile-final-v104-nine-20261025");
        var run=Path.of("../output/concrete-speed-nine-20261025");
        var manifest=m.readTree(Files.readString(old.resolve("manifest.json")));
        var report=m.createObjectNode().put("scope","Exact source transport only; not fresh AI outputs, latency or learning effects.");
        var rows=report.putArray("requests");int before=0,after=0,deltaRequests=0;
        for(var c:manifest.path("cases")) {
            var path=old.resolve("results/candidate").resolve(c.path("key").asString()).resolve("model-calls.json");
            for(var call:m.readTree(Files.readString(path))) {
                String text=call.path("inputPrompt").asString();if(!text.startsWith("{")||!call.path("systemPrompt").asString().startsWith("지적장애인의 생활기술 학습 지원"))continue;
                var wire=m.readTree(text.substring(0,text.lastIndexOf('}')+1));
                if(!wire.has("observationWireEncoding"))continue;
                var raw=ObservationWireEncoding.decode(m,wire);
                var input=raw.deepCopy();var index=input.remove(LiteralEventIndex.FIELD);
                long started=System.nanoTime();var packed=ObservationWireEncoding.encode(m,input);
                if(index!=null)packed.set(LiteralEventIndex.FIELD,index);
                assertThat(ObservationWireEncoding.decode(m,packed)).isEqualTo(raw);
                int oldTokens=QwenTokenCounter.count(wire.toString()),newTokens=QwenTokenCounter.count(packed.toString());
                boolean delta=packed.has(ExactNumericDeltas.FIELD);if(delta)deltaRequests++;
                rows.addObject().put("key",c.path("key").asString()).put("call",call.path("number").asInt())
                    .put("beforeTokens",oldTokens).put("afterTokens",newTokens).put("deltaUsed",delta)
                    .put("sourceRoundTripExact",true).put("encodingSeconds",(System.nanoTime()-started)/1e9);
                before+=oldTokens;after+=newTokens;
            }
            Files.writeString(run.resolve("offline-wire-replay.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
        assertThat(rows.size()).isGreaterThan(9);
        report.put("beforeTokens",before).put("afterTokens",after).put("deltaRequests",deltaRequests)
            .put("tokenReductionPercent",100.0*(before-after)/before).put("freshAiRuns",0);
        Files.writeString(run.resolve("offline-wire-replay.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }
}
