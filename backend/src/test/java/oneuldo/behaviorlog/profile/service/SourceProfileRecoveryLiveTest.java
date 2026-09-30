package oneuldo.behaviorlog.profile.service;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.net.http.HttpClient;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real profile AI call through the production service; persistence is isolated from user data. */
@EnabledIfEnvironmentVariable(named = "AI_SOURCE_PROFILE_LIVE", matches = "true")
class SourceProfileRecoveryLiveTest {
    @Test void corrected_same_play_updates_the_previous_incorrect_profile() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var source = Path.of(System.getenv().getOrDefault("AI_SOURCE_FIXTURE_DIR", "../tmp/persona-loop-20260914"));
        var replay = Path.of(Objects.requireNonNull(System.getenv("AI_SOURCE_REPORT")));
        var report = mapper.readTree(Files.readString(replay));
        assertThat(report.has("analysis")).isTrue();
        var corrected = mapper.treeToValue(report.path("analysis"), AiBehaviorAnalysis.class);
        var old = mapper.readValue(Files.readString(source.resolve("round2-profile.json")), AiUserProfileResponse.class);
        var member = UUID.randomUUID();
        var previous = new AiUserProfile(member, old.profileVersion(), old.previousProfileId(), old.sourceAnalysisId(),
                old.sourceDatasetId(), old.sourceSessionId(), "READY", old.promptVersion(), old.model(), "", "",
                List.of(), old.profile(), null, old.latencyMs());
        var current = new AiBehaviorAnalysisResponse(UUID.randomUUID(), old.sourceDatasetId(), "READY", old.model(),
                report.path("promptVersion").asString(), "replay", 318, 0, Instant.now(), null, corrected);
        var props = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("local.properties"))) { props.load(reader); }
        var url = props.getProperty("ai.ollama.base-url", "https://bluem.myvnc.com");
        var http = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(30));
        var client = new RestOllamaChatClient(RestClient.builder().baseUrl(url).requestFactory(http).build(),
                new OllamaProperties(url, "qwen3.6:27b-q4_K_M", 18432, Duration.ofMinutes(30), Duration.ofMinutes(10),
                        8, "10m", props.getProperty("ai.ollama.api-key", props.getProperty("OLLAMA_API_KEY"))));
        var repository = mock(AiUserProfileRepository.class);
        when(repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member, "READY")).thenReturn(Optional.of(previous));
        when(repository.save(any())).thenAnswer(call -> {
            AiUserProfile saved = call.getArgument(0);
            // Include exact attempts for semantic review, without credentials or database writes.
            var output = mapper.createObjectNode();
            output.put("synthetic", true); output.put("databaseWrites", false);
            output.put("promptVersion", saved.getPromptVersion()); output.put("inputPrompt", saved.getInputPrompt());
            output.set("attempts", mapper.valueToTree(saved.getAttempts()));
            output.set("result", mapper.valueToTree(AiUserProfileResponse.from(saved)));
            Files.writeString(replay.resolveSibling("profile-recovery-" + saved.getPromptVersion() + ".json"),
                    mapper.writerWithDefaultPrettyPrinter().writeValueAsString(output));
            return saved;
        });
        var budget = new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget, "requestTokens", 18000);
        ReflectionTestUtils.setField(budget, "finalOutputTokens", 1800);
        var service = new AiUserProfileService(repository, new AiUserProfilePromptFactory(mapper),
                new AiUserProfileValidator(new MarketAiDifficultyValidator()), client, mapper, budget, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
        var result = service.updateFromSession(member, old.sourceSessionId(), current);
        assertThat(result.status()).isEqualTo("READY");
        assertThat(result.sourceSessionId()).isEqualTo(old.sourceSessionId());
        assertThat(result.profileVersion()).isEqualTo(old.profileVersion() + 1);
    }
}
