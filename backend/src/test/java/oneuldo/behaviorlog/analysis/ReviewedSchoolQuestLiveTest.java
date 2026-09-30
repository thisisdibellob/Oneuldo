package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.RestOllamaChatClient;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/** Real school model and production quest service; persistence boundaries are in memory. */
@EnabledIfEnvironmentVariable(named="AI_REVIEWED_QUEST_LIVE", matches="true")
class ReviewedSchoolQuestLiveTest {
    @Test void 검토된_분석의_연습계획으로_학교모델이_퀘스트를_생성한다() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var file=Path.of(System.getenv("AI_QUEST_ANALYSIS_FILE"));
        var analysis=mapper.readValue(Files.readString(file),AiBehaviorAnalysisResponse.class);
        assertThat(analysis.status()).isEqualTo("READY");
        assertThat(analysis.promptVersion()).isEqualTo("behavior-analysis-v23-claim-evidence");
        Properties local=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {local.load(reader);}
        assertThat(local.getProperty("ai.ollama.base-url")).isEqualTo("https://oneuldo.duckdns.org");
        String key=local.getProperty("ai.ollama.api-key");
        assertThat(key!=null && !key.isBlank()).isTrue();
        var properties=new OllamaProperties("https://oneuldo.duckdns.org","qwen3.6:27b-q4_K_M",18432,
                Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
        http.setReadTimeout(properties.timeout());
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        UUID member=UUID.randomUUID(),profileId=UUID.randomUUID();
        var plan=analysis.analysis().practicePlan();
        var recommendation=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),analysis.datasetId(),analysis.analysisId(),profileId,1,
                "MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_ANALYSIS",
                new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),
                plan.reasonCodes(),analysis.promptVersion(),Instant.now());
        var recommendations=mock(MarketDifficultyRecommendationService.class);
        when(recommendations.recommend(member)).thenReturn(recommendation);
        var profiles=mock(AiUserProfileService.class);
        when(profiles.find(member,profileId)).thenReturn(new AiUserProfileResponse(profileId,1,null,analysis.analysisId(),analysis.datasetId(),
                analysis.analysis().sessionAssessments().getFirst().sessionId(),"READY",analysis.model(),analysis.promptVersion(),analysis.latencyMs(),
                analysis.createdAt(),null,analysis.analysis()));
        var audit=mock(MarketAiQuestAuditService.class);
        var report=mapper.createObjectNode();
        report.put("databaseWrites",false);report.put("inputAnalysisId",analysis.analysisId().toString());
        report.set("practicePlan",mapper.valueToTree(plan));
        doAnswer(call->{report.set("attempts",mapper.valueToTree(call.getArgument(4)));return null;})
                .when(audit).record(any(),any(),any(),any(),any(),any(),any());
        var service=new MarketAiQuestService(new MarketAiQuestPromptFactory(mapper),new MarketAiQuestValidator(),recommendations,audit,profiles,client,mapper, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
        long started=System.nanoTime();
        try {
            var quest=service.generate(member);report.set("quest",mapper.valueToTree(quest));
            assertThat(quest.source()).isEqualTo("AI");
            assertThat(quest.analysisId()).isEqualTo(analysis.analysisId());
            assertThat(quest.quest().difficulty()).isEqualTo(plan.recommendedDifficulty());
            assertThat(quest.quest().objectives()).hasSize(plan.itemCount());
            report.put("status","PASSED");
        } finally {
            report.put("wallSeconds",(System.nanoTime()-started)/1_000_000_000.0);
            Files.writeString(file.resolveSibling("quest-live.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
    }
}
