package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Explicit opt-in full pipeline run of a different real play, without modifying its source events. */
@EnabledIfEnvironmentVariable(named="AI_OTHER_PLAY_REPLAY",matches="true")
class OtherPlayAnalysisTest {
    @Test void fullPlay() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var dir=Path.of("../output/other-play-analysis-2026-09-13");
        var input=mapper.readValue(Files.readString(dir.resolve("input.json")),BehaviorAnalysisInputResponse.class);
        assertThat(input.eventCount()).isEqualTo(187);
        if("true".equals(System.getenv("AI_FAST_PLAY_REPLAY"))) {
            dir=Path.of("../output/fast-play-analysis-2026-09-13");Files.createDirectories(dir);
            Files.writeString(dir.resolve("input.json"),mapper.writeValueAsString(input));
        }
        boolean large="true".equals(System.getenv("AI_WHOLE_PLAY_REPLAY"));
        if(large){dir=Path.of("../output/whole-play-analysis-2026-09-13");Files.createDirectories(dir);Files.writeString(dir.resolve("input.json"),mapper.writeValueAsString(input));}
        final var outputDir=dir;
        Properties props=new Properties();try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {props.load(reader);}
        var http=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(20));
        var real=new RestOllamaChatClient(RestClient.builder().baseUrl("http://127.0.0.1:11436").requestFactory(http).build(),
                new OllamaProperties("http://127.0.0.1:11436","qwen3.6:27b-q4_K_M",large?18432:8192,Duration.ofMinutes(20),Duration.ofMinutes(10),8,"10m",props.getProperty("ai.ollama.api-key")));
        var report=mapper.createObjectNode();report.put("startedAt",Instant.now().toString());report.put("promptVersion",AiBehaviorAnalysisPromptFactory.VERSION);
        report.put("eventCount",input.eventCount());report.put("sessionId",input.input().sessions().getFirst().sessionId().toString());
        var calls=report.putArray("calls");
        Runnable save=()->{try {Files.writeString(outputDir.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));}catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}};
        GroqChatClient client=new GroqChatClient() {
            public GroqChatResult complete(String s,String u){return complete(s,u,1800,0.2);}
            public GroqChatResult complete(String s,String u,int out,double temp){return run(s,u,out,temp,false);}
            public GroqChatResult completeDigest(String s,String u,int out,double temp){return run(s,u,out,temp,true);}
            GroqChatResult run(String s,String u,int out,double temp,boolean digest) {
                var call=calls.addObject();call.put("number",calls.size());call.put("digest",digest);call.put("systemPrompt",s);call.put("inputPrompt",u);call.put("outputMax",out);call.put("startedAt",Instant.now().toString());save.run();
                System.out.println("START call="+calls.size()+" digest="+digest+" inputTokens="+QwenTokenCounter.inputTokens(s,u));
                try {
                    var response=digest?real.completeDigest(s,u,out,temp):real.complete(s,u,out,temp);
                    call.set("response",mapper.valueToTree(response));call.put("finishedAt",Instant.now().toString());save.run();
                    System.out.println("DONE call="+calls.size()+" outputTokens="+response.outputTokens()+" latencyMs="+response.latencyMs());return response;
                }catch(RuntimeException e){call.put("error",e.getClass().getSimpleName());save.run();throw e;}
            }
        };
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",large?18000:7800);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
        var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,mapper,64,budget,new AnalysisCallPacer());
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();long start=System.nanoTime();boolean success=false;
        try(var ignored=AnalysisProgress.bind(update->{report.set("progress",mapper.valueToTree(update));save.run();System.out.println("PROGRESS "+update);})) {
            report.set("result",mapper.valueToTree(pipeline.analyze(input,large?18000:7800,audit)));report.put("status","READY");success=true;
        }catch(RuntimeException failure){report.put("status","FAILED");report.put("error",failure.getMessage());}
        finally {report.put("latencyMs",(System.nanoTime()-start)/1000000);report.put("finishedAt",Instant.now().toString());report.set("audit",mapper.valueToTree(audit));save.run();}
        assertThat(success).isTrue();
    }
}
