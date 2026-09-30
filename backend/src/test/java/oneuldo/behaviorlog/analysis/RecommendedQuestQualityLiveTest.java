package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import static org.assertj.core.api.Assertions.*;

/** Same recorded input, live revised reviewer and quest generator; no DB writes or invented gameplay. */
@EnabledIfEnvironmentVariable(named="AI_RECOMMENDED_QUALITY_LIVE",matches="true")
class RecommendedQuestQualityLiveTest {
    @Test void review_and_next_quest_keep_evidence_and_executable_contracts() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var root=Path.of(System.getenv().getOrDefault("AI_QUALITY_FIXTURE_DIR","../output/ai-only-quality-20260930"));
        var input=mapper.readValue(Files.readString(root.resolve("input.json")),BehaviorAnalysisInputResponse.class);
        var previous=mapper.treeToValue(mapper.readTree(Files.readString(root.resolve("prior-analysis.json"))).path("response"),AiBehaviorAnalysisResponse.class);
        var refs=new AnalysisReferences(mapper,input);
        var prompt=AnalysisReviewPrompt.build(mapper,Files.readString(root.resolve("prior-review.json")),previous.analysis(),refs);
        Files.writeString(root.resolve("revised-review-prompt.json"),prompt);
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,
                Duration.ofMinutes(6),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(6));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        var report=mapper.createObjectNode();report.put("databaseWrites",false);report.put("sameDataset",input.id().toString());
        long start=System.nanoTime();
        try {
            var response=client.complete(AnalysisReviewPrompt.system(),prompt,2400,0.1);
            report.set("reviewResponse",mapper.valueToTree(response));
            assertThat(response.finishReason()).isNotEqualTo("length");
            var analysis=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(
                    refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,response.text(),refs)),input);
            report.set("analysis",mapper.valueToTree(analysis));
            var updated=new AiBehaviorAnalysisResponse(previous.analysisId(),input.id(),"READY",response.model(),
                    AiBehaviorAnalysisPromptFactory.VERSION,previous.evidenceVersion(),input.eventCount(),0,Instant.now(),null,analysis);
            var plan=analysis.practicePlan();
            var recommendation=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.id(),previous.analysisId(),
                    UUID.randomUUID(),1,"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",
                    new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),
                    plan.reasonCodes(),AiBehaviorAnalysisPromptFactory.VERSION,Instant.now());
            var prompts=new MarketAiQuestPromptFactory(mapper);
            String questPrompt=prompts.userPrompt(updated,recommendation);
            Files.writeString(root.resolve("revised-quest-prompt.json"),questPrompt);
            var quest=client.complete(prompts.systemPrompt(),questPrompt,900,0.2);
            report.set("questResponse",mapper.valueToTree(quest));
            assertThat(quest.finishReason()).isNotEqualTo("length");
            var draft=new MarketAiQuestValidator().validate(mapper.readValue(quest.text(),MarketAiQuestDraft.class),plan.recommendedDifficulty());
            assertThat(draft.objectives()).hasSize(plan.itemCount());
            report.set("quest",mapper.valueToTree(draft));report.put("structuralValidation","PASS");
            // Claim meaning and teaching benefit are reviewed from raw output, not asserted by keyword rules.
        } finally {
            report.put("wallSeconds",(System.nanoTime()-start)/1e9);
            Files.writeString(root.resolve("live-quality.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
    }
}
