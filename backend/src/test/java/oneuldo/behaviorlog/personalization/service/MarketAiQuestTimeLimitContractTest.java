package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.repository.MarketAiQuestGenerationRepository;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class MarketAiQuestTimeLimitContractTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();

    @Test void inclusive_bounds_preserve_the_ai_choice_and_invalid_values_are_never_clamped() {
        for (int seconds : List.of(MarketQuestTimePolicy.MINIMUM_SECONDS, 421, MarketQuestTimePolicy.MAXIMUM_SECONDS)) {
            var chosen = draft(seconds);
            assertThat(validator.validateGenerated(chosen, 2)).isSameAs(chosen);
            assertThat(response(chosen, MarketAiQuestPromptFactory.PROMPT_VERSION).quest().timeLimitSeconds()).isEqualTo(seconds);
        }
        for (int seconds : List.of(0, MarketQuestTimePolicy.MINIMUM_SECONDS - 1, MarketQuestTimePolicy.MAXIMUM_SECONDS + 1)) {
            var invalid = draft(seconds);
            assertThatThrownBy(() -> validator.validateGenerated(invalid, 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, failure ->
                            assertThat(failure.details()).containsEntry("code", "TIME_LIMIT_OUT_OF_RANGE")
                                    .containsEntry("path", "/timeLimitSeconds").containsEntry("submittedSeconds", seconds)
                                    .containsEntry("minimumSeconds", MarketQuestTimePolicy.MINIMUM_SECONDS)
                                    .containsEntry("maximumSeconds", MarketQuestTimePolicy.MAXIMUM_SECONDS));
            assertThat(invalid.timeLimitSeconds()).isEqualTo(seconds);
        }
    }

    @Test void old_saved_json_keeps_missing_source_and_only_legacy_response_conversion_uses_default() {
        var json = (tools.jackson.databind.node.ObjectNode)mapper.valueToTree(draft(null));
        json.remove("timeLimitSeconds");
        var restored = mapper.treeToValue(json, MarketAiQuestDraft.class);
        assertThat(restored.timeLimitSeconds()).isNull();
        assertThat(validator.validate(restored)).isSameAs(restored);
        assertThat(response(restored, "market-ai-quest-v19-layout-observation").quest().timeLimitSeconds())
                .isEqualTo(MarketQuestTimePolicy.DEFAULT_SECONDS);
        assertThat(response(restored, MarketAiQuestPromptFactory.PROMPT_VERSION).quest().timeLimitSeconds()).isNull();
        assertThat(response(restored, "market-ai-quest-v21-future").quest().timeLimitSeconds()).isNull();
        assertThatThrownBy(() -> validator.validateGenerated(restored, 2))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, failure ->
                        assertThat(failure.details()).containsEntry("code", "TIME_LIMIT_REQUIRED"));
        assertThat(mapper.valueToTree(restored).path("timeLimitSeconds").isNull()).isTrue();
    }

    @Test void raw_json_requires_an_integer_without_jackson_string_or_decimal_coercion() {
        for (String input : List.of("{}", "{\"timeLimitSeconds\":null}"))
            assertThatThrownBy(() -> validator.validateGeneratedTimeLimitJson(mapper.readTree(input)))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class,
                            failure -> assertThat(failure.details()).containsEntry("code", "TIME_LIMIT_REQUIRED"));
        for (String value : List.of("300.5", "300.0", "\"300\"", "true", "{}", "[]"))
            assertThatThrownBy(() -> validator.validateGeneratedTimeLimitJson(mapper.readTree("{\"timeLimitSeconds\":" + value + "}")))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, failure ->
                            assertThat(failure.details()).containsEntry("code", "TIME_LIMIT_MUST_BE_INTEGER")
                                    .containsEntry("path", "/timeLimitSeconds").containsEntry("requiredType", "integer"));
        assertThatThrownBy(() -> validator.validateGeneratedTimeLimitJson(mapper.readTree("{\"timeLimitSeconds\":2147483648}")))
                .isInstanceOfSatisfying(MarketQuestValidationException.class,
                        failure -> assertThat(failure.details()).containsEntry("code", "TIME_LIMIT_OUT_OF_RANGE"));
        assertThatCode(() -> validator.validateGeneratedTimeLimitJson(mapper.readTree("{\"timeLimitSeconds\":421}")))
                .doesNotThrowAnyException();
    }

    @Test void generation_repairs_missing_decimal_and_out_of_bounds_choices_with_exact_ai_feedback() {
        for (String badValue : List.of("missing", "300.5", "601")) {
            var harness = new Harness();
            var invalid = (tools.jackson.databind.node.ObjectNode)mapper.valueToTree(draft(421));
            if (badValue.equals("missing")) invalid.remove("timeLimitSeconds");
            else invalid.set("timeLimitSeconds", mapper.readTree(badValue));
            var rejectedJson = mapper.writeValueAsString(invalid);
            when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2)))
                    .thenReturn(new GroqChatClient.GroqChatResult(rejectedJson, "test"), output(draft(421)));
            var result = harness.service.generate(harness.member);
            var prompts = ArgumentCaptor.forClass(String.class);
            verify(harness.client, times(2)).complete(anyString(), prompts.capture(), eq(1200), eq(0.2));
            var code = badValue.equals("missing") ? "TIME_LIMIT_REQUIRED"
                    : badValue.equals("300.5") ? "TIME_LIMIT_MUST_BE_INTEGER" : "TIME_LIMIT_OUT_OF_RANGE";
            assertThat(prompts.getAllValues().get(1)).contains(code, "/timeLimitSeconds", "minimumSeconds", "maximumSeconds",
                    "180", "600", "numeric bounds", "서버는 반올림·절삭·문자 변환을 하지 않습니다");
            assertThat(result.quest().timeLimitSeconds()).isEqualTo(421);
            var drafts = ArgumentCaptor.forClass(MarketAiQuestDraft.class);
            @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
            verify(harness.audit).record(eq(harness.member), any(), eq(result), drafts.capture(), attempts.capture(), isNull(), anyString());
            assertThat(drafts.getValue().timeLimitSeconds()).isEqualTo(421);
            assertThat(attempts.getValue().getFirst().rawOutput()).isEqualTo(rejectedJson);
            assertThat(attempts.getValue().getFirst().validationDetails()).containsEntry("code", code);
        }
    }

    @Test void two_rejected_outputs_fail_without_a_default_quest_and_are_audited() {
        var harness = new Harness();
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(draft(null)));
        assertThatThrownBy(() -> harness.service.generate(harness.member)).isInstanceOfSatisfying(ResponseStatusException.class,
                failure -> assertThat(failure.getStatusCode().value()).isEqualTo(503));
        verify(harness.client, times(2)).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.audit).record(eq(harness.member), any(), argThat(response -> response.quest() == null && "FAILED".equals(response.source())),
                isNull(), argThat(attempts -> attempts.size() == 2), eq("AI_QUEST_FAILED"), anyString());
    }

    @Test void json_storage_and_audit_reload_retain_the_selected_seconds_and_invalid_current_cache_regenerates() {
        var saved = mapper.readValue(mapper.writeValueAsString(draft(421)), MarketAiQuestDraft.class);
        var generation = new MarketAiQuestGeneration(UUID.randomUUID(), null, null, UUID.randomUUID(), UUID.randomUUID(),
                "AI", "test", 0, "AI_PROFILE", MarketAiQuestPromptFactory.PROMPT_VERSION, List.of(), saved, null, Instant.now());
        var repository = mock(MarketAiQuestGenerationRepository.class);
        var member = UUID.randomUUID();
        when(repository.findFirstByMemberIdAndRequestKeyAndSourceOrderByCreatedAtDesc(member, "request", "AI"))
                .thenReturn(Optional.of(generation));
        var audit = new MarketAiQuestAuditService(mock(MemberRepository.class), mock(BehaviorAnalysisInputSnapshotRepository.class), repository);
        var reloaded = audit.findReusable(member, "request").orElseThrow();
        assertThat(reloaded.quest().timeLimitSeconds()).isEqualTo(421);
        assertThat(mapper.readValue(mapper.writeValueAsString(reloaded), MarketAiQuestResponse.class).quest().timeLimitSeconds()).isEqualTo(421);
        var harness = new Harness();
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(response(draft(null), MarketAiQuestPromptFactory.PROMPT_VERSION)));
        assertThat(harness.service.generate(harness.member).quest().timeLimitSeconds()).isEqualTo(421);
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        var cached = response(saved, MarketAiQuestPromptFactory.PROMPT_VERSION);
        harness = new Harness();
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(cached));
        assertThat(harness.service.generate(harness.member)).isSameAs(cached);
        verifyNoInteractions(harness.client);
    }

    @Test void prompt_exposes_shared_bounds_and_uses_actual_time_with_support_and_task_context() {
        var practice = new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "규격 연습", "관찰", 2, 2, "LOW", "LOW", "STANDARD", List.of("PRACTICE"));
        var analysis = new AiBehaviorAnalysisResponse(UUID.randomUUID(), UUID.randomUUID(), "READY", "test", "test", "test", 1,
                0, Instant.now(), null, new AiBehaviorAnalysis("관찰", List.of(), List.of(), List.of(), practice));
        var factory = new MarketAiQuestPromptFactory(mapper);
        var prompt = new oneuldo.behaviorlog.analysis.service.LosslessTables(mapper).decode(mapper.readTree(factory.userPrompt(analysis, recommendation(UUID.randomUUID()))));
        assertThat(prompt.path("timePolicy")).isEqualTo(mapper.valueToTree(MarketQuestTimePolicy.context()));
        assertThat(prompt.path("timePlanning").asString()).contains("실제 경과 시간", "만료", "지원 수준", "더 짧은 시간은 자동 난이도 판정이 아니다",
                "시간 원본이 없으면", "남아도 종료", "과거 시간", "AI가 직접 선택");
        assertThat(prompt.path("outputSchema").path("timeLimitSeconds").isIntegralNumber()).isTrue();
        assertThat(factory.systemPrompt()).contains("시간만으로 능력 부족", "제한 시간까지 기다리라고 안내하지");
    }

    private MarketAiQuestDraft draft(Integer seconds) {
        return new MarketAiQuestDraft(2, "CUSTOM", "규격 연습", "우유와 사과를 담아요.", 4000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("apple", 1)),
                List.of("흰 우유 900mL 1개와 사과 1개를 골라요."), List.of("제출할 수 있어요.", "계속 장볼 수 있어요."),
                "연습을 마쳤어요.", "규격 비교 관찰을 위한 연습", List.of("PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "규격 비교 관찰을 위해 배치를 유지해요."), seconds);
    }

    private MarketAiQuestResponse response(MarketAiQuestDraft draft, String version) {
        return MarketAiQuestResponse.from(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "AI", "test", 0, "AI_PROFILE", version, draft);
    }

    private MarketDifficultyRecommendationResponse recommendation(UUID profile) {
        return new MarketDifficultyRecommendationResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), profile, 1,
                "MARKET_SIMULATION", 2, "AI_PROFILE", new MarketDifficultyRecommendationResponse.Adjustments(2, "LOW", "LOW", "STANDARD"),
                List.of("PRACTICE"), "test", Instant.now());
    }

    private GroqChatClient.GroqChatResult output(MarketAiQuestDraft draft) {
        return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(draft), "test");
    }

    private class Harness {
        final UUID member = UUID.randomUUID();
        final GroqChatClient client = mock(GroqChatClient.class);
        final MarketAiQuestAuditService audit = mock(MarketAiQuestAuditService.class);
        final MarketDifficultyRecommendationService recommendations = mock(MarketDifficultyRecommendationService.class);
        final MarketAiQuestService service;
        Harness() {
            var profileId = UUID.randomUUID();
            when(recommendations.recommend(member)).thenReturn(recommendation(profileId));
            var profile = mock(AiUserProfileResponse.class);
            when(profile.profileId()).thenReturn(profileId);
            when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
            var profiles = mock(AiUserProfileService.class);
            when(profiles.find(member, profileId)).thenReturn(profile);
            var prompts = spy(new MarketAiQuestPromptFactory(mapper));
            when(prompts.systemPrompt()).thenReturn("system");
            doReturn("{}").when(prompts).userPrompt(any(), any());
            when(client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(draft(421)));
            when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0)))
                    .thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
            service = new MarketAiQuestService(prompts, validator, recommendations, audit, profiles, client, mapper, mock(PracticeHistoryService.class));
        }
    }
}
