package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.List;
import oneuldo.ai.client.RestOllamaChatClient;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="AI_RELEASE_PLAN_NEGATIVE_LIVE", matches="true")
class ReleasePlanNegativeLiveTest {
    @Test void release_reviewer_rejects_the_saved_real_visual_highlight_promise() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        Path dir=Path.of(System.getProperty("oneuldo.analysis-smoke.output")); Path target=dir.getParent().resolve("release-negative-support-check.json");
        assertThat(Files.exists(target)).isFalse();
        var saved=mapper.readTree(Files.readString(dir.resolve("help-movement-timeout/result.json")));
        var responses=saved.path("providerResponses");String candidate=responses.get(responses.size()-1).path("response").path("text").asString();
        var input=mapper.readValue(Files.readString(dir.resolve("help-movement-timeout/input.json")),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(mapper,input);var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        String source=AnalysisReviewPrompt.build(mapper,AnalysisSynthesisPrompt.build(mapper,factory,input,List.of(),refs,false),null,refs);
        String prompt=AnalysisPlanSemanticReview.prompt(mapper,source,candidate);
        var report=mapper.createObjectNode().put("newGamePlays",0).put("scope","saved real unsupported proposal, independent release reviewer")
                .put("reviewVersion",AnalysisPlanSemanticReview.VERSION).put("sourceCandidateRaw",candidate).put("inputPrompt",prompt).put("systemPrompt",AnalysisPlanSemanticReview.system());
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(10),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());http.setReadTimeout(Duration.ofMinutes(10));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        long start=System.nanoTime();
        try {
            var response=client.complete(AnalysisPlanSemanticReview.system(),prompt,AnalysisPlanSemanticReview.OUTPUT_TOKENS,0.0);
            report.set("response",mapper.valueToTree(response));
            assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(mapper,response.text(),candidate)).isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
            assertThat(mapper.readTree(response.text()).path("issues")).anySatisfy(issue->assertThat(issue.path("code").asString()).isEqualTo("UNSUPPORTED_CAPABILITY"));
            report.put("status","EXPECTED_REJECTION");
        } finally {report.put("wallSeconds",(System.nanoTime()-start)/1e9);Files.writeString(target,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");}
    }
}
