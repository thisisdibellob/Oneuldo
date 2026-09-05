package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Explicit opt-in: ONE real Groq call, read-only DB, local ignored audit artifact. Never runs in ordinary CI. */
@EnabledIfEnvironmentVariable(named="AI_REDUCE_REPLAY", matches="limit|replay")
class SavedReductionReplayTest {
    private static final String RUN="6af4ded6-29df-4f2d-b694-ae77e53adb98";
    private static final String DATASET="dab3a096-1880-4453-8192-8c2cd21100fc";
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();

    @Test void 저장된_25번째_통합요청만_재검증한다() throws Exception {
        boolean probe="limit".equals(System.getenv("AI_REDUCE_REPLAY"));
        int outputMax=probe?1200:900;
        var attempts=mapper.readTree(query("SELECT attempts FROM ai_behavior_analyses WHERE id='"+RUN+"';"));
        String saved=attempts.get(24).path("inputPrompt").asString();
        var data=mapper.readValue(query("SELECT input_data FROM behavior_analysis_input_snapshots WHERE id='"+DATASET+"';"),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        var refs=new AnalysisReferences(mapper,input);
        String submitted=factory.compactReductionPrompt(saved);
        assertThat(mapper.readTree(submitted).path("chunkAnalyses")).isEqualTo(mapper.readTree(saved).path("chunkAnalyses"));
        List<AiObservationDigest> children=new ArrayList<>();
        for(var child:mapper.readTree(saved).path("chunkAnalyses")) children.add(refs.readDigest(child.toString()));
        new AnalysisTokenBudget().requireFits(factory.observationSystem(),submitted,outputMax,7000,"REPLAY_INPUT_TOO_LARGE");

        Properties local=new Properties();
        if(Files.exists(Path.of("local.properties"))) try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {local.load(reader);}
        String key=System.getenv("GROQ_API_KEY");
        if(key==null || key.isBlank()) key=local.getProperty("ai.groq.api-key",local.getProperty("GROQ_API_KEY"));
        assertThat(key!=null && !key.isBlank()).as("Local Groq credential is required; never print it").isTrue();
        String model="qwen/qwen3.6-27b";
        String body=mapper.writeValueAsString(Map.of("model",model,"messages",List.of(
                Map.of("role","system","content",factory.observationSystem()),Map.of("role","user","content",submitted)),
                "max_completion_tokens",outputMax,"temperature",0.2,"top_p",0.8,"reasoning_effort","none","reasoning_format","hidden","stream",false));
        var request=HttpRequest.newBuilder(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                .timeout(Duration.ofSeconds(25)).header("Authorization","Bearer "+key).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        long start=System.nanoTime();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        long latency=(System.nanoTime()-start)/1_000_000;
        ObjectNode audit=mapper.createObjectNode();
        audit.put("recordedAt",Instant.now().toString());audit.put("sourceRunId",RUN);audit.put("sourceAttempt",25);
        audit.put("datasetId",DATASET);audit.put("promptVersion",AiBehaviorAnalysisPromptFactory.VERSION);
        audit.put("model",model);audit.put("outputMax",outputMax);audit.put("httpStatus",response.statusCode());audit.put("latencyMs",latency);
        audit.put("systemPrompt",factory.observationSystem());audit.put("inputPrompt",submitted);
        audit.put("localInputTokens",QwenTokenCounter.inputTokens(factory.observationSystem(),submitted));
        var headers=audit.putObject("limitHeaders");
        for(String name:List.of("retry-after","x-ratelimit-limit-tokens","x-ratelimit-limit-requests","x-ratelimit-remaining-tokens","x-ratelimit-remaining-requests","x-ratelimit-reset-tokens"))
            response.headers().firstValue(name).filter(v->v.matches("[0-9.hms-]{1,64}")).ifPresent(v->headers.put(name,v));
        String validationError=null;
        if(response.statusCode()==200) {
            var root=mapper.readTree(response.body());var choice=root.path("choices").get(0);
            String raw=choice.path("message").path("content").asString();
            audit.put("rawOutput",raw);audit.put("finishReason",choice.path("finish_reason").asString());audit.set("usage",root.path("usage"));
            audit.put("localOutputTokens",QwenTokenCounter.count(raw));
            try {
                assertThat(choice.path("finish_reason").asString()).isEqualTo("stop");
                new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validateReduction(refs.readDigest(raw),input,children);
                audit.put("valid",true);
            } catch(RuntimeException | AssertionError failure) { audit.put("valid",false);validationError="INVALID_REDUCTION_OR_TRUNCATION"; }
        } else {
            // Provider errors may contain organization identifiers. Persist only allowlisted limit metadata.
            String error=response.body().toLowerCase(Locale.ROOT);
            String kind=error.contains("output tokens per minute")?"OTPM":error.contains("input tokens per minute")?"ITPM":error.contains("tokens per minute")?"TPM":"unknown";
            audit.put("limitKind",kind);
            var numbers=java.util.regex.Pattern.compile("(?i)\\b(Limit|Requested|Used)[:= ]+(\\d+)").matcher(response.body());
            while(numbers.find()) audit.put(numbers.group(1).toLowerCase(Locale.ROOT),Long.parseLong(numbers.group(2)));
        }
        Path folder=Path.of("build","diagnostics");Files.createDirectories(folder);
        Path path=folder.resolve("reduce-"+(probe?"limit":"replay")+"-"+System.currentTimeMillis()+".json");
        Files.writeString(path,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(audit));
        System.out.println("REDUCE_REPLAY status="+response.statusCode()+" latencyMs="+latency+" outputMax="+outputMax+" artifact="+path.toAbsolutePath());
        if(probe) assertThat(response.statusCode()).isIn(200,429);
        else {assertThat(response.statusCode()).isEqualTo(200);assertThat(validationError).isNull();}
    }
    private String query(String sql) throws Exception {
        var process=new ProcessBuilder("docker","exec","oneuldo-postgres","psql","-U","oneuldo","-d","oneuldo","-Atc",sql).start();
        String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();return output;
    }
}
