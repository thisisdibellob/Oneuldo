package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Current production quest generation/review with real school AI; persistence alone is mocked. No gameplay. */
@EnabledIfEnvironmentVariable(named="AI_FOUR_IMPROVEMENTS_QUEST_LIVE", matches="true")
class FourImprovementsQuestLiveTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final Path analysisRoot = Path.of(System.getProperty("oneuldo.analysis-smoke.output"));
    private final Path root = analysisRoot.getParent();
    private void save(Path file, ObjectNode value) {
        try { Files.writeString(file, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n"); }
        catch (Exception e) { throw new IllegalStateException("QUEST_AUDIT_SAVE_FAILED", e); }
    }
    @Test void corrected_selection_current_plan_generates_a_reviewed_next_quest() throws Exception {
        var dir = Path.of(System.getProperty("oneuldo.quest-live.output", root.resolve("quest-after-corrected-selection").toString())); Files.createDirectories(dir);
        var target = dir.resolve("result.json"); assertThat(Files.exists(target)).isFalse();
        var result = mapper.readTree(Files.readString(analysisRoot.resolve("corrected-selection/result.json")));
        assertThat(result.path("status").asString()).isEqualTo("READY");
        var analysis = mapper.treeToValue(result.path("analysis"), AiBehaviorAnalysis.class);
        var input = mapper.readValue(Files.readString(analysisRoot.resolve("corrected-selection/input.json")), BehaviorAnalysisInputResponse.class);
        UUID member = UUID.randomUUID(), profileId = UUID.randomUUID(), analysisId = UUID.randomUUID();
        var profile = new AiUserProfileResponse(profileId, 1, null, analysisId, input.id(), input.input().sessions().getFirst().sessionId(),
                "READY", "qwen3.6:27b-q4_K_M", AiBehaviorAnalysisPromptFactory.VERSION, 0, Instant.now(), null, analysis);
        var plan = analysis.practicePlan();
        var recommendation = new MarketDifficultyRecommendationResponse(UUID.randomUUID(), input.id(), analysisId, profileId, 1,
                "MARKET_SIMULATION", plan.recommendedDifficulty(), "AI_ANALYSIS",
                new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(), plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport()),
                plan.reasonCodes(), AiBehaviorAnalysisPromptFactory.VERSION, Instant.now());
        var recommendations = mock(MarketDifficultyRecommendationService.class); when(recommendations.recommend(member)).thenReturn(recommendation);
        var profiles = mock(AiUserProfileService.class); when(profiles.find(member, profileId)).thenReturn(profile);
        var historyService = mock(PracticeHistoryService.class);
        var history = mapper.createArrayNode();
        for (var session : input.input().sessions()) {
            var play = history.addObject().put("sessionId", session.sessionId().toString()).put("playOrder", history.size())
                    .put("currentSession", true).put("sourceAvailable", true).put("orderingScope", "SYNTHETIC_SINGLE_SESSION_SOURCE");
            play.set("recordedPractice", PracticeHistoryService.project(mapper, input, session.sessionId()));
        }
        when(historyService.forProfile(member, profile)).thenReturn(history);
        var audit = mock(MarketAiQuestAuditService.class);
        var report = mapper.createObjectNode().put("status", "RUNNING").put("syntheticTechnicalFixtures", true).put("newGamePlays", 0)
                .put("databaseWrites", false).put("profileUpdatedByAI", false).put("startedAt", Instant.now().toString())
                .put("questVersion", MarketAiQuestPromptFactory.PROMPT_VERSION);
        report.set("sourceAnalysis", mapper.valueToTree(analysis)); report.set("sourceHistory", history);
        var responses = report.putArray("providerResponses");
        var key = Files.readString(Path.of(System.getProperty("user.home"), ".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties = new OllamaProperties("http://127.0.0.1:18083", "qwen3.6:27b-q4_K_M", 18432, Duration.ofMinutes(10), Duration.ofSeconds(10), 8, "10m", key);
        var http = new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(10));
        var real = new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(), properties);
        GroqChatClient recording = new GroqChatClient() {
            @Override public GroqChatResult complete(String s, String u) { return complete(s, u, 1200, .2); }
            @Override public GroqChatResult complete(String s, String u, int max, double temperature) {
                save(target, report);
                var response = real.complete(s, u, max, temperature);
                responses.addObject().put("systemPrompt", s).put("inputPrompt", u).put("outputMax", max).set("response", mapper.valueToTree(response));
                save(target, report); return response;
            }
        };
        doAnswer(call -> { report.set("attempts", mapper.valueToTree(call.getArgument(4))); save(target, report); return null; })
                .when(audit).record(any(), any(), any(), any(), any(), any(), anyString());
        var service = new MarketAiQuestService(new MarketAiQuestPromptFactory(mapper), new MarketAiQuestValidator(), recommendations, audit, profiles, recording, mapper, historyService);
        long start = System.nanoTime();
        try {
            var quest = service.generate(member); report.set("quest", mapper.valueToTree(quest)); report.put("status", "READY");
            assertThat(quest.source()).isEqualTo("AI"); assertThat(quest.quest().objectives()).hasSize(plan.itemCount());
            assertThat(report.path("attempts").get(report.path("attempts").size()-1).path("validationDetails").path("observationPlan").path("learningClaim").asString()).isEqualTo("NOT_ESTABLISHED");
        } catch (RuntimeException failure) { report.put("status", "FAILED").put("failureClass", failure.getClass().getSimpleName()); throw failure; }
        finally { report.put("wallSeconds", (System.nanoTime()-start)/1e9).put("completedAt", Instant.now().toString()); save(target, report); }
    }
}
