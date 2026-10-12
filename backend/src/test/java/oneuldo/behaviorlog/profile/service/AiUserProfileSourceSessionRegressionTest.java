package oneuldo.behaviorlog.profile.service;

import java.time.Instant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.personalization.service.PracticeHistoryService;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestInfo;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Same source records can produce new interpretations, never additional played sessions. */
class AiUserProfileSourceSessionRegressionTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final UUID member = UUID.randomUUID();
    private final UUID currentSession = UUID.randomUUID(), priorSession = UUID.randomUUID();
    private final UUID currentDataset = UUID.randomUUID(), priorDataset = UUID.randomUUID();
    private final UUID currentEvent = UUID.randomUUID(), priorEvent = UUID.randomUUID();
    private final AiUserProfileRepository profiles = mock(AiUserProfileRepository.class);
    private final PracticeHistoryService history = mock(PracticeHistoryService.class);
    private final GroqChatClient client = mock(GroqChatClient.class);
    private final AnalysisTokenBudget budget = mock(AnalysisTokenBudget.class);
    private String testCase;

    @BeforeEach void recordCaseName(TestInfo info) {
        testCase = info.getTestMethod().orElseThrow().getName();
    }

    @Test void same_dataset_and_session_replace_contaminated_observation_and_keep_real_distinct_history() {
        var actualPrior = stored(1, null, priorSession, priorDataset, "이전 별도 플레이의 제출", priorEvent);
        var contaminated = stored(2, actualPrior.getId(), currentSession, currentDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", currentEvent);
        when(profiles.findByIdAndMemberIdAndStatus(actualPrior.getId(), member, "READY"))
                .thenReturn(Optional.of(actualPrior));
        var saved = update(contaminated);
        var prompt = mapper.readTree(saved.getInputPrompt());

        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isTrue();
        assertThat(prompt.path("profileUpdateKind").asString()).isEqualTo("REINTERPRET_EXISTING_PLAY");
        assertThat(prompt.path("sourceHistoryComplete").asBoolean()).isTrue();
        assertFreshSourceInput(prompt);
        assertThat(prompt.path("sourceSessionProvenance").path("priorDistinct")).hasSize(1);
        assertThat(prompt.path("sourceSessionProvenance").path("priorDistinct").get(0).path("datasetId").asString())
                .isEqualTo(priorDataset.toString());
        assertThat(saved.getPreviousProfileId()).isEqualTo(contaminated.getId());
        assertThat(saved.getProfileVersion()).isEqualTo(3);
        assertThat(saved.getSourceSessionId()).isEqualTo(currentSession);
        assertThat(saved.getSourceDatasetId()).isEqualTo(currentDataset);
        assertThat(saved.getProfile().summary()).isEqualTo("이번 원본 기록을 재해석한 결과");
        // The old erroneous interpretation stays available in the immutable audit only.
        assertThat(contaminated.getProfile().findings().getFirst().observation()).contains("두 번째 성공");
    }

    @Test void reanalysis_of_an_ancestor_session_does_not_reuse_later_cumulative_claims() {
        var original = stored(1, null, currentSession, currentDataset, "이번 원본을 처음 해석", currentEvent);
        var reinterpreted = stored(2, original.getId(), currentSession, currentDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", currentEvent);
        var laterDistinct = stored(3, reinterpreted.getId(), priorSession, priorDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", priorEvent);
        when(profiles.findByIdAndMemberIdAndStatus(reinterpreted.getId(), member, "READY"))
                .thenReturn(Optional.of(reinterpreted));
        when(profiles.findByIdAndMemberIdAndStatus(original.getId(), member, "READY"))
                .thenReturn(Optional.of(original));
        var saved = update(laterDistinct, true);
        var prompt = mapper.readTree(saved.getInputPrompt());

        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isTrue();
        assertFreshSourceInput(prompt);
        assertThat(prompt.path("sourceSessionProvenance").path("current")).hasSize(1);
        assertThat(prompt.path("sourceSessionProvenance").path("priorDistinct")).hasSize(1);
        var currentSource = prompt.path("sourceSessionProvenance").path("current").get(0).path("sessionId").asString();
        var actualPriorSource = prompt.path("sourceSessionProvenance").path("priorDistinct").get(0).path("sessionId").asString();
        assertThat(currentSource).isNotEqualTo(actualPriorSource);
        assertThat(prompt.path("currentAnalysis").path("sessionAssessments").get(0).path("sessionId").asString())
                .isEqualTo(currentSource);
        assertThat(saved.getPreviousProfileId()).isEqualTo(laterDistinct.getId());
        assertThat(saved.getProfileVersion()).isEqualTo(4);
        var raw = LosslessHistoryEncoding.decodeHistory(mapper, prompt);
        assertThat(raw.get(0).path("currentSession").asBoolean()).isTrue();
        assertThat(raw.get(1).path("currentSession").asBoolean()).isFalse();
        assertThat(raw.get(0).path("recordedSessionStartedAt").asString())
                .isLessThan(raw.get(1).path("recordedSessionStartedAt").asString());
    }

    @Test void a_changed_dataset_or_analysis_id_does_not_turn_the_same_session_into_a_new_play() {
        var oldDataset = UUID.randomUUID();
        var earlier = stored(1, null, currentSession, oldDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", currentEvent);
        var saved = update(earlier);
        var prompt = mapper.readTree(saved.getInputPrompt());

        assertThat(saved.getSourceDatasetId()).isNotEqualTo(earlier.getSourceDatasetId());
        assertThat(saved.getSourceAnalysisId()).isNotEqualTo(earlier.getSourceAnalysisId());
        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isTrue();
        assertThat(prompt.path("profileUpdateKind").asString()).isEqualTo("REINTERPRET_EXISTING_PLAY");
        assertFreshSourceInput(prompt);
    }

    @Test void missing_profile_link_does_not_assert_a_new_play_or_reuse_unverifiable_claims() {
        var latest = stored(3, UUID.randomUUID(), priorSession, priorDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", priorEvent);
        var prompt = mapper.readTree(update(latest).getInputPrompt());

        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isFalse();
        assertThat(prompt.path("sourceHistoryComplete").asBoolean()).isFalse();
        assertThat(prompt.path("profileUpdateKind").asString()).isEqualTo("SOURCE_HISTORY_UNRESOLVED");
        assertFreshSourceInput(prompt);
    }

    @Test void distinct_new_source_keeps_previous_observation_as_an_indirect_report() {
        var prior = stored(1, null, priorSession, priorDataset, "별도 플레이에서 우유를 제출했다", priorEvent);
        var prompt = mapper.readTree(update(prior).getInputPrompt());

        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isFalse();
        assertThat(prompt.path("profileUpdateKind").asString()).isEqualTo("ADD_DISTINCT_SOURCE_SESSION");
        assertThat(prompt.path("previousProfile").path("observationsIncluded").asBoolean()).isTrue();
        assertThat(prompt.path("previousProfile").path("findings").get(0).path("observation").asString())
                .isEqualTo("별도 플레이에서 우유를 제출했다");
        assertThat(LosslessHistoryEncoding.decodeHistory(mapper, prompt)).hasSize(2);
    }

    @Test void a_new_session_does_not_reimport_repeated_success_prose_from_old_same_source_revisions() {
        var original = stored(1, null, priorSession, priorDataset, "별도 플레이의 최초 관찰", priorEvent);
        var repeated = stored(2, original.getId(), priorSession, priorDataset,
                "이전 성공을 재현했고 두 번째 성공으로 안정적 유지와 숙달을 보였다", priorEvent);
        when(profiles.findByIdAndMemberIdAndStatus(original.getId(), member, "READY"))
                .thenReturn(Optional.of(original));
        var prompt = mapper.readTree(update(repeated).getInputPrompt());

        assertThat(prompt.path("sameSessionReanalysis").asBoolean()).isFalse();
        assertThat(prompt.path("profileUpdateKind").asString()).isEqualTo("ADD_DISTINCT_SOURCE_SESSION");
        assertThat(prompt.path("sourceHistoryComplete").asBoolean()).isTrue();
        assertThat(prompt.path("priorSourceRevisionsPresent").asBoolean()).isTrue();
        assertThat(prompt.path("sourceSessionProvenance").path("priorDistinct")).hasSize(1);
        assertFreshSourceInput(prompt);
    }

    private void assertFreshSourceInput(tools.jackson.databind.JsonNode prompt) {
        assertThat(prompt.path("previousProfile").path("observationsIncluded").asBoolean()).isFalse();
        assertThat(prompt.path("previousProfile").path("findings")).isEmpty();
        assertThat(prompt.toString()).doesNotContain("이전 성공을 재현했고", "두 번째 성공으로 안정적 유지");
        var raw = LosslessHistoryEncoding.decodeHistory(mapper, prompt);
        assertThat(raw).hasSize(2);
        var prior = java.util.stream.StreamSupport.stream(raw.spliterator(), false)
                .filter(row -> !row.path("currentSession").asBoolean()).findFirst().orElseThrow();
        var current = java.util.stream.StreamSupport.stream(raw.spliterator(), false)
                .filter(row -> row.path("currentSession").asBoolean()).findFirst().orElseThrow();
        assertThat(prior.path("recordedPractice").path("tasks").get(0).path("mission").path("briefing").get(0).asString())
                .isEqualTo("별도 플레이에서 우유 한 개를 골라요.");
        assertThat(prior.path("recordedPractice").path("purchaseEvents").get(0).path("cart").path("milk").asInt())
                .isEqualTo(1);
        assertThat(prior.has("priorAiJudgment")).isFalse();
        assertThat(current.has("priorAiJudgment")).isFalse();
        assertThat(prompt.path("profileComparisonScope").asString()).isEqualTo(ProfilePromptInstructions.TEXT.get("profileComparisonScope"));
        assertThat(prompt.path("practiceHistoryScope").asString()).isEqualTo(ProfilePromptInstructions.TEXT.get("practiceHistoryScope"));
        assertThat(prompt.path("sourceScope").asString()).contains("never reconstruct", "without new experience/success");
    }

    private AiUserProfile update(AiUserProfile latest) {
        return update(latest, false);
    }

    private AiUserProfile update(AiUserProfile latest, boolean targetIsEarlierPlay) {
        var currentAnalysis = analysis(currentSession, "이번 제출을 원본으로 대조했다", currentEvent);
        var current = new AiBehaviorAnalysisResponse(UUID.randomUUID(), currentDataset, "READY", "mock-provider",
                "analysis-test", "evidence-test", 1, 0, Instant.now(), null, currentAnalysis);
        when(profiles.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member, "READY"))
                .thenReturn(Optional.of(latest));
        when(profiles.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(history.forUpdate(member, latest, current)).thenReturn(rawHistory(targetIsEarlierPlay));
        var draft = (ObjectNode) mapper.valueToTree(currentAnalysis);
        draft.remove("sessionAssessments");
        draft.put("summary", "이번 원본 기록을 재해석한 결과");
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble())).thenReturn(
                new GroqChatClient.GroqChatResult(draft.toString(), "mock-provider", "stop", 100, 100, 1L));
        when(budget.finalOutputTokens()).thenReturn(1500);
        when(budget.requestTokens()).thenReturn(18000);
        var service = new AiUserProfileService(profiles, new AiUserProfilePromptFactory(mapper),
                new AiUserProfileValidator(new MarketAiDifficultyValidator()), client, mapper, budget, history);
        var response = service.updateFromSession(member, currentSession, current);

        assertThat(response.status()).isEqualTo("READY");
        assertThat(response.profile().sessionAssessments()).isEqualTo(currentAnalysis.sessionAssessments());
        var saved = ArgumentCaptor.forClass(AiUserProfile.class);
        verify(profiles).save(saved.capture());
        verify(client).complete(anyString(), anyString(), anyInt(), anyDouble());
        verify(history).forUpdate(member, latest, current);
        assertThat(saved.getValue().getAttempts()).hasSize(1);
        assertThat(saved.getValue().getAttempts().getFirst().rawOutput()).isEqualTo(draft.toString());
        recordEvidence(saved.getValue(), latest);
        return saved.getValue();
    }

    private void recordEvidence(AiUserProfile saved, AiUserProfile previous) {
        String outputDirectory = System.getProperty("oneuldo.test.profile-evidence-dir");
        if (outputDirectory == null) return;
        var record = mapper.createObjectNode().put("testCase", testCase).put("executionKind", "MOCK_PROVIDER_UNIT_TEST")
                .put("newActualPlay", false).put("promptVersion", saved.getPromptVersion())
                .put("inputPrompt", saved.getInputPrompt()).put("systemPrompt", saved.getSystemPrompt());
        record.set("priorProfile", mapper.valueToTree(previous.getProfile()));
        record.set("savedProfile", mapper.valueToTree(saved.getProfile()));
        record.set("mockProviderAttempts", mapper.valueToTree(saved.getAttempts()));
        record.set("decodedPracticeHistory", LosslessHistoryEncoding.decodeHistory(mapper, mapper.readTree(saved.getInputPrompt())));
        try {
            var directory = Path.of(outputDirectory);
            Files.createDirectories(directory);
            Files.writeString(directory.resolve(testCase + "-" + saved.getId() + ".json"), mapper.writeValueAsString(record),
                    java.nio.file.StandardOpenOption.CREATE_NEW);
        } catch (java.io.IOException error) {
            throw new java.io.UncheckedIOException(error);
        }
    }

    private ArrayNode rawHistory(boolean targetIsEarlierPlay) {
        var raw = mapper.createArrayNode();
        for (boolean current : targetIsEarlierPlay ? List.of(true, false) : List.of(false, true)) {
            int order = raw.size() + 1;
            var row = raw.addObject().put("sessionId", (current ? currentSession : priorSession).toString())
                    .put("sourceDatasetId", (current ? currentDataset : priorDataset).toString())
                    .put("currentSession", current).put("playOrder", order).put("sourceAvailable", true)
                    .put("currentSessionMeaning", "CURRENT_ANALYSIS_TARGET_NOT_LATEST_PLAY")
                    .put("orderingScope", "RECORDED_SESSION_START_WITH_PROFILE_LINK_TIEBREAK")
                    .put("recordedSessionStartedAt", "2026-10-0" + order + "T00:00:00Z")
                    .put("recordedSessionEndedAt", "2026-10-0" + order + "T00:10:00Z")
                    .put("priorAiJudgment", "SUCCESS");
            var practice = row.putObject("recordedPractice");
            var mission = practice.putArray("tasks").addObject().putObject("mission");
            mission.putArray("briefing").add(current ? "이번 플레이에서 우유 한 개를 골라요." : "별도 플레이에서 우유 한 개를 골라요.");
            mission.putArray("objectives").addObject().put("productId", "milk").put("quantity", 1);
            practice.putArray("purchaseEvents").addObject().put("eventCode", "SHOP.CHECKOUT_SUBMITTED")
                    .putObject("cart").put("milk", 1);
        }
        return raw;
    }

    private AiUserProfile stored(long version, UUID previousId, UUID session, UUID dataset, String observation, UUID event) {
        return new AiUserProfile(member, version, previousId, UUID.randomUUID(), dataset, session,
                "READY", "old-prompt", "mock-provider", "", "", List.of(), analysis(session, observation, event), null, 0);
    }

    private AiBehaviorAnalysis analysis(UUID session, String observation, UUID event) {
        return new AiBehaviorAnalysis("프로필 관찰", List.of(new AiBehaviorAnalysis.Finding("F1", "상품 선택",
                observation, "원본 제출의 관찰이다", List.of(), List.of(event), "목표와 상품 표기를 비교한다")),
                List.of(new AiBehaviorAnalysis.SessionAssessment(session, "SUCCESS", "원본 제출의 관찰", List.of(event))),
                List.of(), new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "상품 선택 확인", "실제 제출을 관찰한다", 1, 1,
                        "LOW", "LOW", "SIMPLIFIED", List.of("OBSERVATION_PRACTICE")));
    }
}
