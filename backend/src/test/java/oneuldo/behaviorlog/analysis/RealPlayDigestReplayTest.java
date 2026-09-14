package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Opt-in read-only replay of an existing play; credentials are never written to artifacts. */
@EnabledIfEnvironmentVariable(named="AI_REAL_DIGEST_REPLAY", matches="true")
class RealPlayDigestReplayTest {
    @Test void replay_saved_failures_and_call_same_failed_chunk() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        boolean structured="true".equals(System.getenv("AI_SCHEMA_DIGEST_REPLAY"));
        boolean facts="true".equals(System.getenv("AI_OBSERVED_FACTS_REPLAY"));
        boolean semantics="true".equals(System.getenv("AI_EVENT_SEMANTICS_REPLAY"));
        var dir=Path.of(facts?"../output/observed-facts-retest-2026-09-13":semantics?"../output/event-semantics-retest-2026-09-13":structured?"../output/schema-digest-retest-2026-09-13":"../output/digest-retest-2026-09-13"); Files.createDirectories(dir);
        var process=new ProcessBuilder("docker","exec","oneuldo-postgres","psql","-U","oneuldo","-d","oneuldo","-Atc",
            "SELECT input_data FROM behavior_analysis_input_snapshots WHERE id='acf16dad-4b9c-4584-b852-2338580a7304';").start();
        String json=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();
        var data=mapper.readValue(json,BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        var refs=new AnalysisReferences(mapper,input);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var audit=mapper.readTree(Files.readString(Path.of("../output/real-play-reanalysis-2026-09-13/audit.json")));
        var report=mapper.createObjectNode(); report.put("startedAt",Instant.now().toString());
        var replay=report.putArray("savedResponseReplay");
        for(var a:audit.path("attempts")) {
            var row=replay.addObject(); row.put("attempt",replay.size());
            try {validator.validateDigest(refs.readDigest(a.path("rawOutput").asString()),input);row.put("valid",true);}
            catch(RuntimeException e) {row.put("valid",false);row.put("reason",e.getMessage());}
        }
        Files.writeString(dir.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        // Keep the exact failed input and system prompt; replace only the output contract for this A/B probe.
        String saved=audit.path("attempts").get(3).path("inputPrompt").asString();
        int end=saved.lastIndexOf("\n구간 "); assertThat(end).isPositive();
        var prompt=(ObjectNode)mapper.readTree(saved.substring(0,end));
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        prompt.put("outputContract",factory.digestContract());
        String submitted=mapper.writeValueAsString(prompt)+saved.substring(end);
        String system=audit.path("attempts").get(3).path("systemPrompt").asString();
        if(semantics) {
            var previous=mapper.readTree(Files.readString(Path.of("../output/schema-digest-retest-2026-09-13/report.json")));
            assertThat(submitted).isEqualTo(previous.path("inputPrompt").asString());
            assertThat(system).isEqualTo(previous.path("systemPrompt").asString());
            system += factory.marketEventSemantics();
            report.put("change",factory.marketEventSemantics());
        }
        if(facts) {
            var previous=mapper.readTree(Files.readString(Path.of("../output/event-semantics-retest-2026-09-13/report.json")));
            assertThat(submitted).isEqualTo(previous.path("inputPrompt").asString());
            assertThat(system).isEqualTo(previous.path("systemPrompt").asString());
            var ids=data.sessions().stream().flatMap(s->s.events().stream()).filter(e->e.sequence()>=112&&e.sequence()<=154).map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).collect(java.util.stream.Collectors.toSet());
            var computed=new ObservedFacts(mapper).build(MovementProjection.select(input,ids),input);
            var wrapped=mapper.createObjectNode();wrapped.set("observedFacts",computed);
            var aliased=mapper.readTree(refs.encode(wrapped.toString(),false)).path("observedFacts");
            prompt.set("observedFacts",aliased);
            submitted=mapper.writeValueAsString(prompt)+saved.substring(end);
            report.set("addedFacts",aliased);
        }
        int output=facts?Math.min(1800,7800-QwenTokenCounter.inputTokens(system,submitted)):1800;
        assertThat(output).isGreaterThanOrEqualTo(900);
        report.put("outputMax",output);
        new AnalysisTokenBudget().requireFits(system,submitted,output,7800,"REPLAY_TOO_LARGE");
        Properties props=new Properties();try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {props.load(reader);}
        String key=props.getProperty("ai.ollama.api-key");String base=props.getProperty("ai.ollama.base-url");
        assertThat(key!=null&&!key.isBlank()).isTrue();assertThat(base).startsWith("https://");
        var bodyMap=new java.util.HashMap<String,Object>(Map.of("model","qwen3.6:27b-q4_K_M","messages",List.of(Map.of("role","system","content",system),Map.of("role","user","content",submitted)),
            "think",false,"stream",false,"keep_alive","10m","options",Map.of("num_ctx",8192,"num_predict",output,"temperature",0.2,"top_p",0.8)));
        if(structured) {bodyMap.put("format",oneuldo.ai.client.ObservationOutputSchema.VALUE);base="http://127.0.0.1:11436";}
        String body=mapper.writeValueAsString(bodyMap);
        var request=HttpRequest.newBuilder(URI.create(base+"/api/chat")).timeout(Duration.ofMinutes(20))
            .header("Authorization","Bearer "+key).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        report.put("systemPrompt",system);report.put("inputPrompt",submitted);
        Files.writeString(dir.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        long start=System.nanoTime();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        report.put("latencyMs",(System.nanoTime()-start)/1_000_000);report.put("httpStatus",response.statusCode());report.put("finishedAt",Instant.now().toString());
        var raw=mapper.readTree(response.body());report.set("response",raw);
        boolean valid=false;
        try {
            assertThat(response.statusCode()).isEqualTo(200);assertThat(raw.path("done_reason").asString()).isEqualTo("stop");
            var ids=data.sessions().stream().flatMap(s->s.events().stream()).filter(e->e.sequence()>=112&&e.sequence()<=154).map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).collect(java.util.stream.Collectors.toSet());
            validator.validateDigest(refs.readDigest(raw.path("message").path("content").asString()),MovementProjection.select(input,ids)); valid=true;
        } catch(RuntimeException|AssertionError e) {report.put("validationError",e.getMessage());}
        report.put("valid",valid);
        Files.writeString(dir.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        System.out.println("DIGEST_RETEST valid="+valid+" latencyMs="+report.path("latencyMs").asLong());
        assertThat(valid).isTrue();
    }
}
