package oneuldo.behaviorlog.profile.service;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Replays the recorded old-plan failure through the real profile service. No user/database writes.
 * Offline mode checks transmission/budget only; live meaning is assessed from the saved model output. */
@EnabledIfEnvironmentVariable(named="AI_NEXT_FOCUS_REPLAY", matches="offline|live")
class NextFocusProfileReplayTest {
    @Test void latest_banana_failure_is_transmitted_without_the_previous_milk_probe_plan() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var fixture = Path.of("../output/minjae-next-focus-3-recommendations-20261002/group-01");
        var old = mapper.readValue(Files.readString(fixture.resolve("round-02/profile.json")), AiUserProfileResponse.class);
        var current = mapper.treeToValue(mapper.readTree(Files.readString(fixture.resolve("round-03/analysis.json")))
                .path("response"), AiBehaviorAnalysisResponse.class);
        var history = mapper.readTree(Files.readString(fixture.resolve("round-03/profile-input-audit.json"))).path("practiceHistory");
        var member = UUID.randomUUID();
        var previous = new AiUserProfile(member, old.profileVersion(), old.previousProfileId(), old.sourceAnalysisId(),
                old.sourceDatasetId(), old.sourceSessionId(), "READY", old.promptVersion(), old.model(), "", "",
                List.of(), old.profile(), null, old.latencyMs());
        var prompts = new AiUserProfilePromptFactory(mapper);
        var prompt = new AiUserProfileReferences(mapper, previous, current)
                .encode(prompts.withPracticeHistory(prompts.userPrompt(previous, current), history));
        var wire = mapper.readTree(prompt);
        assertThat(wire.path("previousProfile").has("practicePlan")).isFalse();
        assertThat(wire.path("currentAnalysis").path("sessionAssessments").get(0).path("judgment").asString()).isEqualTo("FAILURE");
        assertThat(wire.path("practiceHistory").toString()).contains("banana-single", "acceptedProductIds", "banana");
        var compared = wire.path("currentTaskComparisonSource");
        assertThat(compared.size()).isEqualTo(1);
        assertThat(compared.get(0).path("requirements").get(0).path("objectives").get(1)
                .path("acceptedProductIds").toString()).isEqualTo("[\"banana\"]");
        assertThat(compared.get(0).path("submissions").toString()).contains("banana-single");
        var budget = new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget, "requestTokens", 18000);
        ReflectionTestUtils.setField(budget, "finalOutputTokens", 2400);
        budget.requireFits(prompts.systemPrompt(), prompt, 2400, 18000, "REPLAY_PROFILE_EXCEEDS_LIMIT");
        var out = Path.of("../output/quest-quality-fix-20261009/profile-replay-" + UUID.randomUUID());
        Files.createDirectories(out);
        Files.writeString(out.resolve("input.json"), prompt);
        var audit = mapper.createObjectNode().put("databaseWrites", false).put("newGameplay", false)
                .put("mode", System.getenv("AI_NEXT_FOCUS_REPLAY")).put("promptVersion", AiUserProfilePromptFactory.VERSION)
                .put("questPromptVersion", MarketAiQuestPromptFactory.PROMPT_VERSION)
                .put("inputTokensIncludingOutputReserve", budget.total(prompts.systemPrompt(), prompt, 2400));
        writeAudit(out, mapper, audit);
        if ("live".equals(System.getenv("AI_NEXT_FOCUS_REPLAY"))) {
            var key = Files.readString(Path.of(System.getProperty("user.home"), ".local/share/oneuldo/school-gateway-client.key")).strip();
            var http = new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
            http.setReadTimeout(Duration.ofMinutes(6));
            var configuredUrl = System.getenv("AI_NEXT_FOCUS_URL");
            var url = configuredUrl == null || configuredUrl.isBlank() ? "http://127.0.0.1:18083" : configuredUrl.strip();
            var actualClient = new RestOllamaChatClient(RestClient.builder().baseUrl(url).requestFactory(http).build(),
                    new OllamaProperties(url, "qwen3.6:27b-q4_K_M", 18432, Duration.ofMinutes(6), Duration.ofSeconds(10), 8, "10m", key));
            audit.put("liveUrl", url).put("requestedModel", "qwen3.6:27b-q4_K_M");
            var profileAudit = audit.putObject("profile");
            var questAudit = audit.putObject("quest");
            profileAudit.putArray("calls"); questAudit.putArray("calls");
            String[] stage = { "profile" };
            GroqChatClient client = new GroqChatClient() {
                @Override public GroqChatResult complete(String system, String user) { return complete(system, user, 256, 0.7); }
                @Override public GroqChatResult complete(String system, String user, int outputMax, double temperature) {
                    var stageAudit = (ObjectNode)audit.path(stage[0]);
                    var call = stageAudit.withArray("calls").addObject().put("startedAt", Instant.now().toString())
                            .put("systemPrompt", system).put("inputPrompt", user).put("outputMax", outputMax)
                            .put("temperature", temperature);
                    long started = System.nanoTime();
                    writeAudit(out, mapper, audit);
                    try {
                        var response = actualClient.complete(system, user, outputMax, temperature);
                        call.set("response", mapper.valueToTree(response));
                        return response;
                    } catch (RuntimeException failure) {
                        call.put("failureType", failure.getClass().getSimpleName());
                        if (failure instanceof oneuldo.ai.exception.AiTransportException transport)
                            call.put("failureCode", transport.code().name());
                        throw failure;
                    } finally {
                        call.put("wallTimeMs", elapsed(started)).put("completedAt", Instant.now().toString());
                        writeAudit(out, mapper, audit);
                    }
                }
            };
            var repository = mock(AiUserProfileRepository.class);
            when(repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member, "READY")).thenReturn(Optional.of(previous));
            when(repository.save(any())).thenAnswer(call -> {
                AiUserProfile saved = call.getArgument(0);
                audit.set("attempts", mapper.valueToTree(saved.getAttempts()));
                audit.set("result", mapper.valueToTree(AiUserProfileResponse.from(saved)));
                profileAudit.set("attempts", mapper.valueToTree(saved.getAttempts()));
                profileAudit.set("result", mapper.valueToTree(AiUserProfileResponse.from(saved)));
                return saved;
            });
            var practiceHistory = mock(PracticeHistoryService.class);
            when(practiceHistory.forUpdate(member, previous, current)).thenReturn((tools.jackson.databind.node.ArrayNode)history);
            var service = new AiUserProfileService(repository, prompts, new AiUserProfileValidator(new MarketAiDifficultyValidator()),
                    client, mapper, budget, practiceHistory);
            long profileStarted = System.nanoTime();
            AiUserProfileResponse updated;
            try {
                updated = service.updateFromSession(member, current.analysis().sessionAssessments().getFirst().sessionId(), current);
                assertThat(updated.status()).isEqualTo("READY");
            } catch (RuntimeException | AssertionError failure) {
                profileAudit.put("stageFailureType", failure.getClass().getSimpleName());
                throw failure;
            } finally {
                profileAudit.put("wallTimeMs", elapsed(profileStarted));
                writeAudit(out, mapper, audit);
            }

            stage[0] = "quest";
            long questStarted = System.nanoTime();
            try {
                // Use the new live profile's plan, not a repaired/handwritten recommendation.
                var plan = updated.profile().practicePlan();
                var recommendation = new MarketDifficultyRecommendationResponse(UUID.randomUUID(), updated.sourceDatasetId(),
                        updated.sourceAnalysisId(), updated.profileId(), updated.profileVersion(), "MARKET_SIMULATION",
                        plan.recommendedDifficulty(), "AI_PROFILE", new MarketDifficultyRecommendationResponse.Adjustments(
                                plan.itemCount(), plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport()),
                        plan.reasonCodes(), updated.promptVersion(), Instant.now());
                var recommendations = mock(MarketDifficultyRecommendationService.class);
                when(recommendations.recommend(member)).thenReturn(recommendation);
                var profiles = mock(AiUserProfileService.class);
                when(profiles.find(member, updated.profileId())).thenReturn(updated);
                when(practiceHistory.forProfile(member, updated)).thenReturn((tools.jackson.databind.node.ArrayNode)history);
                var questAudits = mock(MarketAiQuestAuditService.class);
                when(questAudits.findReusable(any(), anyString())).thenReturn(Optional.empty());
                doAnswer(invocation -> {
                    MarketAiQuestResponse response = invocation.getArgument(2);
                    List<MarketAiQuestGeneration.Attempt> attempts = invocation.getArgument(4);
                    questAudit.set("attempts", mapper.valueToTree(attempts));
                    questAudit.set("result", mapper.valueToTree(response));
                    questAudit.set("validatedQuest", mapper.valueToTree(invocation.getArgument(3)));
                    questAudit.set("failureReason", mapper.valueToTree(invocation.getArgument(5)));
                    questAudit.put("requestKey", (String)invocation.getArgument(6));
                    writeAudit(out, mapper, audit);
                    return null;
                }).when(questAudits).record(eq(member), any(), any(), any(), anyList(), any(), anyString());
                var questPrompts = new MarketAiQuestPromptFactory(mapper);
                var questInput = questPrompts.withPracticeHistory(questPrompts.userPrompt(updated.asAnalysisResponse(), recommendation), history);
                Files.writeString(out.resolve("quest-input.json"), questInput);
                questAudit.set("recommendationFromProfile", mapper.valueToTree(recommendation));
                questAudit.put("inputTokensIncludingOutputReserve", budget.total(questPrompts.systemPrompt(), questInput, 900));
                var questService = new MarketAiQuestService(questPrompts, new MarketAiQuestValidator(), recommendations,
                        questAudits, profiles, client, mapper, practiceHistory);
                ReflectionTestUtils.setField(questService, "configuredModel", "qwen3.6:27b-q4_K_M");
                var quest = questService.generate(member);
                assertThat(quest.source()).isEqualTo("AI");
                assertThat(quest.profileId()).isEqualTo(updated.profileId());
                assertThat(quest.quest().objectives()).hasSize(plan.itemCount());
                // No keyword assertion declares the pedagogy improved; inspect the saved original outputs.
            } catch (RuntimeException | AssertionError failure) {
                questAudit.put("stageFailureType", failure.getClass().getSimpleName());
                throw failure;
            } finally {
                questAudit.put("wallTimeMs", elapsed(questStarted));
                writeAudit(out, mapper, audit);
            }
        } else Files.writeString(out.resolve("audit.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(audit));
    }

    private static long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000L; }

    private static void writeAudit(Path directory, JsonMapper mapper, ObjectNode audit) {
        try {
            Files.writeString(directory.resolve("audit.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(audit));
        } catch (java.io.IOException failure) {
            throw new java.io.UncheckedIOException(failure);
        }
    }
}
