package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import oneuldo.ai.client.*;
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
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Three fresh final-analysis reviews of frozen real plays; no actor, profile writes or quest calls. */
@EnabledIfEnvironmentVariable(named="AI_LEARNING_SUPPORT_LIVE", matches="true")
class LearningSupportLiveTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final Path out=Path.of(System.getenv().getOrDefault("AI_LEARNING_SUPPORT_OUTPUT", "../output/learning-support-fix-20261001"));

    @Test void three_frozen_plays_receive_fresh_analysis_not_automatic_learning_labels() throws Exception {
        Files.createDirectories(out);var budget=new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget,"requestTokens",18000);
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var props=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(6),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());http.setReadTimeout(Duration.ofMinutes(6));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(http).build(),props);
        var outcomes=new ArrayList<String>();
        for(var name:List.of("baseline","supported","probe")) {
            Path target=out.resolve(name+"-fresh-analysis.json");
            assertThat(Files.exists(target)).as("Never treat saved responses as new calls").isFalse();
            var input=mapper.readValue(Files.readString(out.resolve("fixtures/"+name+"-input.json")),BehaviorAnalysisInputResponse.class);
            var prior=mapper.readValue(Files.readString(out.resolve("fixtures/"+name+"-prior.json")),AiBehaviorAnalysis.class);
            var refs=new AnalysisReferences(mapper,input);
            var source=(ObjectNode)new LosslessTables(mapper).decode(mapper.readTree(mapper.readValue(Files.readString(out.resolve("fixtures/"+name+"-source.json")),String.class)));
            var raw=mapper.createObjectNode();raw.set(SourceEventDetails.FIELD,SourceEventDetails.build(mapper,input));
            source.set(SourceEventDetails.FIELD,new LosslessTables(mapper).decode(mapper.readTree(refs.encode(raw.toString()))).path(SourceEventDetails.FIELD));
            String prompt=AnalysisReviewPrompt.build(mapper,source.toString(),prior,refs);
            var report=mapper.createObjectNode();report.put("scope","fresh final analysis; frozen preprocessing; no new play/profile/quest");
            report.put("case",name);report.put("reviewVersion",AnalysisReviewPrompt.VERSION);
            report.put("systemPrompt",AnalysisReviewPrompt.system());report.put("inputPrompt",prompt);report.put("eventCount",input.eventCount());
            report.put("expectedJudgment",name.equals("supported")?"SUCCESS":"FAILURE");
            long started=System.nanoTime();
            try {
                report.put("estimatedRequestTokens",budget.total(AnalysisReviewPrompt.system(),prompt,2400));
                budget.requireFits(AnalysisReviewPrompt.system(),prompt,2400,18000,"REVIEW_INPUT_TOO_LARGE");
                System.out.println("LIVE_START "+name);
                var response=client.complete(AnalysisReviewPrompt.system(),prompt,2400,0.1);report.set("response",mapper.valueToTree(response));
                assertThat(response.finishReason()).isNotEqualTo("length");
                var analysis=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(
                    refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,response.text(),refs)),input);
                report.set("analysis",mapper.valueToTree(analysis));report.put("status","READY");
                String expected=name.equals("supported")?"SUCCESS":"FAILURE";
                report.put("judgmentMatchesRecordedTask",analysis.sessionAssessments().getFirst().judgment().equals(expected));
                outcomes.add(analysis.sessionAssessments().getFirst().judgment());
                System.out.println("LIVE_DONE "+name+" "+analysis.sessionAssessments().getFirst().judgment());
            } catch(Exception|AssertionError failure) {
                report.put("status","FAILED");report.put("error",failure.getMessage());outcomes.add("FAILED");
                if(failure instanceof ReviewEvidenceException evidence)report.set("validationFailure",mapper.valueToTree(evidence.details()));
                System.out.println("LIVE_FAILED "+name+" "+failure.getClass().getSimpleName());
            } finally {
                report.put("wallSeconds",(System.nanoTime()-started)/1e9);
                Files.writeString(target,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
            }
        }
        assertThat(outcomes).containsExactly("FAILURE","SUCCESS","FAILURE");
    }
}
