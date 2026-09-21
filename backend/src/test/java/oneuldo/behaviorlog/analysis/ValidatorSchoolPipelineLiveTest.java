package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.RestOllamaChatClient;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Full fresh model pipeline, using saved synthetic input. No database or profile writes. */
@EnabledIfEnvironmentVariable(named="AI_VALIDATOR_LIVE", matches="true")
class ValidatorSchoolPipelineLiveTest {
    @Test void fresh_full_analysis_reports_validation_failures_and_latency() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        Path inputPath=Path.of(System.getenv().getOrDefault("AI_VALIDATOR_INPUT","../output/analysis-request-2026-09-18/input.json"));
        Path output=Path.of(System.getenv().getOrDefault("AI_VALIDATOR_OUTPUT","../output/validator-fix-2026-09-18/live.json"));
        Files.createDirectories(output.getParent());
        var input=mapper.readValue(Files.readString(inputPath),BehaviorAnalysisInputResponse.class);
        var local=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {local.load(reader);}
        var properties=new OllamaProperties(System.getenv().getOrDefault("AI_VALIDATOR_BASE_URL",
                local.getProperty("ai.ollama.base-url","https://oneuldo.duckdns.org")),
                "qwen3.6:27b-q4_K_M",Integer.parseInt(local.getProperty("ai.ollama.context-length","18432")),
                Duration.ofMinutes(10),Duration.ofMinutes(10),8,"10m",local.getProperty("ai.ollama.api-key"));
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
        http.setReadTimeout(properties.timeout());
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        var budget=new AnalysisTokenBudget();
        int limit=Integer.parseInt(local.getProperty("ai.behavior-analysis.request-token-budget","18000"));
        ReflectionTestUtils.setField(budget,"requestTokens",limit);
        ReflectionTestUtils.setField(budget,"chunkOutputTokens",Integer.parseInt(local.getProperty("ai.behavior-analysis.chunk-output-tokens","1800")));
        ReflectionTestUtils.setField(budget,"finalOutputTokens",Integer.parseInt(local.getProperty("ai.behavior-analysis.final-output-tokens","1800")));
        var report=mapper.createObjectNode();
        report.put("startedAt",Instant.now().toString());report.put("reviewVersion",AnalysisReviewPrompt.VERSION);
        report.put("promptVersion",AiBehaviorAnalysisPromptFactory.VERSION);
        report.put("databaseWrites",false);report.put("checkpointReuse",false);report.put("eventCount",input.eventCount());
        report.put("loopbackDiagnostic",properties.baseUrl().startsWith("http://127.0.0.1:"));
        report.put("model",properties.model());report.put("contextLength",properties.contextLength());report.put("requestBudget",limit);
        report.put("status","RUNNING");
        Files.writeString(output,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        long started=System.nanoTime();
        RuntimeException failure=null;
        try {
            var result=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper),
                    new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,mapper,64,budget,new AnalysisCallPacer())
                    .withQualityReview(true).analyze(input,limit,audit);
            report.put("status","READY");report.set("analysis",mapper.valueToTree(result));
        } catch(RuntimeException e) {
            failure=e;report.put("status","FAILED");report.put("errorCode",e.getMessage());
        } finally {
            report.put("wallSeconds",(System.nanoTime()-started)/1_000_000_000.0);
            report.set("attempts",mapper.valueToTree(audit));
            Files.writeString(output,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
        assertThat(failure).as("Full pipeline result; details saved at %s",output).isNull();
    }
}
