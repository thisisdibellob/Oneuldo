package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Opt-in offline measurement. Never prints source contents or invokes a cloud provider. */
class MovementInputBenchmarkTest {
    @Test @EnabledIfEnvironmentVariable(named="MOVEMENT_BENCHMARK_SNAPSHOT",matches=".+")
    void measure_real_snapshot_without_cloud_calls() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var data=mapper.readValue(Files.readString(Path.of(System.getenv("MOVEMENT_BENCHMARK_SNAPSHOT"))),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        var refs=new AnalysisReferences(mapper,input);
        String old=refs.encode(factory.userPrompt(input),false),wire=refs.encode(factory.userPrompt(input));
        var codec=new CompactBehaviorTimeline(mapper);var tables=new LosslessTables(mapper);
        var before=codec.decodeExpanded(tables.decode(mapper.readTree(old)).path("behaviorTimeline"));
        var after=codec.decodeExpanded(tables.decode(mapper.readTree(wire)).path("behaviorTimeline"));
        assertThat(after.path("eventCount")).isEqualTo(before.path("eventCount"));
        for(int s=0;s<before.path("sessions").size();s++) {
            var a=before.path("sessions").get(s).path("events");var b=after.path("sessions").get(s).path("events");
            assertThat(b.size()).isEqualTo(a.size());
            for(int i=0;i<a.size();i++) {
                for(String key:List.of("sequence","occurredAt","receivedAt","elapsedFromSessionStartMs")) assertThat(b.get(i).path(key)).isEqualTo(a.get(i).path(key));
                for(String key:List.of("x","y","blocked","controlMode")) assertThat(b.get(i).path("payload").path(key)).isEqualTo(a.get(i).path("payload").path(key));
            }
        }
        var pipeline=new TimelineAnalysisPipeline(factory,new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),null,mapper);
        int chunks=pipeline.partition(input,7000).size();
        int beforeChunks=baselineChunks(input,input,refs,factory);
        System.out.println("MOVEMENT_BENCHMARK events="+data.eventCount()+" beforeTokens="+QwenTokenCounter.count(old)+" afterTokens="+QwenTokenCounter.count(wire)+" beforeChunks="+beforeChunks+" afterChunks="+chunks);
    }
    int baselineChunks(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full,AnalysisReferences refs,AiBehaviorAnalysisPromptFactory factory) {
        String prompt=refs.encode(factory.observationPrompt(part,full),false)+"\n구간 64/64: 세션 일부이며 구간 밖 행동을 가정하지 마세요.\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.";
        if(new AnalysisTokenBudget().total(factory.observationSystem(),prompt,900)<=7000) return 1;
        if(part.eventCount()<2) throw new IllegalArgumentException("BENCHMARK_SINGLE_EVENT_TOO_LARGE");
        var events=part.input().sessions().stream().flatMap(s->s.events().stream()).toList();int half=events.size()/2;
        var left=new HashSet<UUID>();var right=new HashSet<UUID>();
        for(int i=0;i<events.size();i++) (i<half?left:right).add(events.get(i).behaviorLogId());
        return baselineChunks(MovementProjection.select(part,left),full,refs,factory)+baselineChunks(MovementProjection.select(part,right),full,refs,factory);
    }
}
