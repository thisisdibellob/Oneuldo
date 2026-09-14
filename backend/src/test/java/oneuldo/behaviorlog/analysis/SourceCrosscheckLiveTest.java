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

/** Opt-in replay of the saved synthetic failure. Real provider calls, no database writes. */
@EnabledIfEnvironmentVariable(named="AI_SOURCE_CROSSCHECK_LIVE",matches="true")
class SourceCrosscheckLiveTest {
    @Test void replay_failed_observation_and_challenge_final_with_incorrect_saved_digests() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var source=Path.of(System.getenv().getOrDefault("AI_SOURCE_FIXTURE_DIR","../tmp/persona-loop-20260914"));
        var folder=Path.of("build/diagnostics/source-crosscheck-"+System.currentTimeMillis());Files.createDirectories(folder);
        var input=mapper.readValue(Files.readString(source.resolve("round2-input.json")),BehaviorAnalysisInputResponse.class);
        assertThat(input.eventCount()).isEqualTo(318);
        var session=input.input().sessions().getFirst();
        var events=session.events().subList(102,255);
        var data=new BehaviorAnalysisInput(input.input().schemaVersion(),input.id(),input.generatedAt(),input.input().analysisWindow(),
                input.input().anonymousSubjectId(),1,events.size(),List.of(new BehaviorAnalysisInput.SessionTimeline(
                session.sessionId(),session.startedAt(),session.endedAt(),session.integrity(),events)));
        var part=new BehaviorAnalysisInputResponse(input.id(),input.schemaVersion(),input.generatedAt(),1,events.size(),data);
        var refs=new AnalysisReferences(mapper,input);var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);
        var props=new Properties();try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {props.load(reader);}
        var url=props.getProperty("ai.ollama.base-url",props.getProperty("OLLAMA_BASE_URL","https://bluem.myvnc.com"));
        var http=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(30));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(url).requestFactory(http).build(),
                new OllamaProperties(url,"qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",
                props.getProperty("ai.ollama.api-key",props.getProperty("OLLAMA_API_KEY"))));
        var report=mapper.createObjectNode();report.put("startedAt",Instant.now().toString());report.put("promptVersion",AiBehaviorAnalysisPromptFactory.VERSION);
        report.put("synthetic",true);report.put("databaseWrites",false);report.put("datasetId",input.id().toString());
        var calls=report.putArray("calls");
        Runnable save=()->{try {Files.writeString(folder.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));}
            catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}};
        System.out.println("SOURCE_CROSSCHECK_REPORT="+folder.toAbsolutePath());
        String observation=refs.encode(factory.observationPrompt(part,input))+"\n구간 2/3: 세션 일부이며 구간 밖 행동을 가정하지 마세요.";
        budget.requireFits(factory.observationSystem(),observation,1800,18000,"LIVE_PREFLIGHT");
        var a=calls.addObject();a.put("stage","OBSERVATION_SAME_153_EVENTS");a.put("systemPrompt",factory.observationSystem());a.put("inputPrompt",observation);
        a.put("inputTokens",QwenTokenCounter.inputTokens(factory.observationSystem(),observation));a.put("outputMax",1800);save.run();
        GroqChatClient.GroqChatResult observed;
        String reuse=System.getenv("AI_SOURCE_REUSE_OBSERVATION_REPORT");
        if(reuse==null) observed=client.completeDigest(factory.observationSystem(),observation,1800,0.2);
        else {
            var prior=mapper.readTree(Files.readString(Path.of(reuse))).path("calls").get(0);
            assertThat(prior.path("systemPrompt").asString()).isEqualTo(factory.observationSystem());
            assertThat(mapper.readTree(prior.path("inputPrompt").asString().split("\\n구간 2/3:",2)[0]))
                    .isEqualTo(mapper.readTree(observation.split("\\n구간 2/3:",2)[0]));
            observed=mapper.treeToValue(prior.path("response"),GroqChatClient.GroqChatResult.class);
            a.put("reusedFrom",reuse);
        }
        a.set("response",mapper.valueToTree(observed));save.run();
        assertThat(observed.finishReason()).isNotEqualTo("length");
        var digest=validator.validateDigest(refs.readDigest(observed.text()),part);report.set("observation",mapper.valueToTree(digest));save.run();
        // Deliberately retain all old incorrect summaries: test whether the original facts can refute them.
        var saved=new ArrayList<AiObservationDigest>();
        for(String line:Files.readAllLines(source.resolve("round2-checkpoints.jsonl"))) {
            if(saved.size()==3)break;
            saved.add(refs.readDigest(mapper.readTree(line).path("response").path("text").asString()));
        }
        assertThat(saved).hasSize(3);
        String finalPrompt=AnalysisSynthesisPrompt.build(mapper,factory,input,saved,refs,false);
        String system=FinalAnalysisPromptCompactor.systemPrompt();
        budget.requireFits(system,finalPrompt,1800,18000,"LIVE_PREFLIGHT");
        var b=calls.addObject();b.put("stage","FINAL_CHALLENGE_WITH_OLD_INCORRECT_DIGESTS");b.put("systemPrompt",system);b.put("inputPrompt",finalPrompt);
        b.put("inputTokens",QwenTokenCounter.inputTokens(system,finalPrompt));b.put("outputMax",1800);save.run();
        var finished=client.complete(system,finalPrompt,1800,0.2);b.set("response",mapper.valueToTree(finished));save.run();
        assertThat(finished.finishReason()).isNotEqualTo("length");
        var result=validator.validate(refs.read(finished.text()),input);report.set("analysis",mapper.valueToTree(result));
        report.put("finishedAt",Instant.now().toString());report.put("status","COMPLETED_REQUIRES_SEMANTIC_REVIEW");save.run();
        assertThat(digest.observations().stream().flatMap(o->o.evidenceEventIds().stream()).toList())
                .containsAnyOf(session.events().get(103).behaviorLogId(),session.events().get(104).behaviorLogId());
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("SUCCESS");
    }
}
