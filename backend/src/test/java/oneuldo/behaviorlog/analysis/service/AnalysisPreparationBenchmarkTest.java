package oneuldo.behaviorlog.analysis.service;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import org.springframework.test.util.ReflectionTestUtils;

/** Opt-in, offline production preparation measurement; never sends source data to a server. */
class AnalysisPreparationBenchmarkTest {
    private static class RequestReached extends Error {}

    @Test @EnabledIfEnvironmentVariable(named="PREPARATION_BENCHMARK_SNAPSHOT",matches=".+")
    void prepares_real_snapshot_until_first_model_request() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var data=mapper.readValue(Files.readString(Path.of(System.getenv("PREPARATION_BENCHMARK_SNAPSHOT"))),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        var prompts=new AiBehaviorAnalysisPromptFactory(mapper);
        var budget=new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget,"requestTokens",18000);
        ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);
        ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
        var client=mock(GroqChatClient.class);
        var timings=new LinkedHashMap<String,Object>();
        timings.put("events",data.eventCount());
        long start=System.nanoTime();
        var refs=new AnalysisReferences(mapper,input);
        String encoded=refs.encode(prompts.userPrompt(input));
        timings.put("initialEncodingMs",(System.nanoTime()-start)/1_000_000);
        timings.put("wholePromptTokens",QwenTokenCounter.count(encoded));
        System.out.println("PREPARATION_BENCHMARK_INITIAL "+mapper.writeValueAsString(timings));
        var progress=new ArrayList<AnalysisProgress.Update>();
        org.mockito.stubbing.Answer<GroqChatClient.GroqChatResult> stop=inv -> {
            String system=inv.getArgument(0),prompt=inv.getArgument(1);int output=inv.getArgument(2);
            assertThat(budget.total(system,prompt,output)).isLessThanOrEqualTo(18000);
            timings.put("firstRequestMs",(System.nanoTime()-start)/1_000_000);
            timings.put("firstRequestInputTokens",QwenTokenCounter.inputTokens(system,prompt));
            throw new RequestReached();
        };
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(stop);
        when(client.completeDigest(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(stop);
        var pipeline=new TimelineAnalysisPipeline(prompts,new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,mapper,
                64,budget,new AnalysisCallPacer()).withQualityReview(true);
        try(var ignored=AnalysisProgress.bind(update -> {
            progress.add(update);
            System.out.println("PREPARATION_PROGRESS "+mapper.writeValueAsString(update));
        })) {
            assertThatThrownBy(()->pipeline.analyze(input,18000,new ArrayList<>(),refs,encoded)).isInstanceOf(RequestReached.class);
        }
        progress.stream().filter(p->"OBSERVING".equals(p.stage())).findFirst().ifPresent(p->timings.put("chunks",p.total()));
        // Compare every reconstructed source field, not just event counts or coordinates.
        var tables=new LosslessTables(mapper);var codec=new CompactBehaviorTimeline(mapper);
        var baseline=(tools.jackson.databind.node.ObjectNode)tables.decode(mapper.readTree(refs.encode(prompts.userPrompt(input),false)));
        var compact=(tools.jackson.databind.node.ObjectNode)tables.decode(mapper.readTree(encoded));
        baseline.set("behaviorTimeline",codec.decodeExpanded(baseline.path("behaviorTimeline")));
        compact.set("behaviorTimeline",codec.decodeExpanded(compact.path("behaviorTimeline")));
        assertThat(compact.equals(baseline)).as("all reconstructed prompt fields preserved").isTrue();
        timings.put("allSourceFieldsPreserved",true);
        System.out.println("PREPARATION_BENCHMARK_RESULT "+mapper.writeValueAsString(timings));
        String result=System.getenv("PREPARATION_BENCHMARK_RESULT");
        if(result!=null) Files.writeString(Path.of(result),mapper.writeValueAsString(timings));
    }
}
