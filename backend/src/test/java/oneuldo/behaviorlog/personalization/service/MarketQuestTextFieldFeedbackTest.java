package oneuldo.behaviorlog.personalization.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Exact field diagnostics drive AI rewriting; missing fields and misspellings are never filled by Java. */
class MarketQuestTextFieldFeedbackTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();

    @Test void unknown_keys_and_missing_or_wrong_container_types_produce_actionable_feedback_without_coercion() {
        var extra = validSource(); extra.put("rationale", "잘못된 위치"); var before = extra.deepCopy();
        assertThatThrownBy(() -> validator.validateGeneratedShapeJson(extra))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details())
                        .containsEntry("code", "INVALID_FIELD_SHAPE").containsEntry("path", "").containsEntry("unexpectedKey", "rationale"));
        assertThat(extra).isEqualTo(before);
        for (String field : List.of("reasonCodes", "objectives", "briefing", "checkoutDialogue")) {
            var source = validSource(); source.remove(field);
            assertThatThrownBy(() -> validator.validateGeneratedShapeJson(source))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details())
                            .containsEntry("path", "/" + field).containsEntry("expectedType", "ARRAY").containsEntry("submittedMissing", true));
            source.put(field, "[]");
            assertThatThrownBy(() -> validator.validateGeneratedShapeJson(source))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details())
                            .containsEntry("path", "/" + field).containsEntry("submittedType", "STRING"));
        }
    }

    @Test void required_text_fields_report_exact_paths_keys_and_missing_null_blank_type_or_length() {
        var fields = Map.of("/title", 40, "/description", 120, "/successMessage", 80,
                "/adaptationSummary", 240, "/environmentPlan/rationale", 160, "/briefing/0", 80, "/checkoutDialogue/1", 80);
        for (var field : fields.entrySet()) {
            for (String supplied : List.of("null", "\"   \"", "42", "{}", mapper.writeValueAsString("x".repeat(field.getValue() + 1)))) {
                var source = validSource(); set(source, field.getKey(), mapper.readTree(supplied)); var before = source.deepCopy();
                assertThatThrownBy(() -> validator.validateGeneratedTextJson(source))
                        .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> {
                            assertThat(e.details()).containsEntry("code", "INVALID_TEXT_LENGTH").containsEntry("path", field.getKey())
                                    .containsEntry("maximumLength", field.getValue()).containsEntry("requiresNonNull", true)
                                    .containsEntry("requiresNonBlank", true).containsEntry("rawFieldPresenceRecorded", true);
                            assertThat(e.details()).containsEntry("requiredKey", field.getKey().substring(field.getKey().lastIndexOf('/') + 1));
                            if (supplied.equals("null")) assertThat(e.details()).containsEntry("submittedNull", true).containsEntry("submittedMissing", false);
                            if (supplied.equals("\"   \"")) assertThat(e.details()).containsEntry("submittedBlank", true).containsEntry("submittedLength", 3);
                            if (supplied.equals("42")) assertThat(e.details()).containsEntry("submittedType", "NUMBER");
                        });
                assertThat(source).isEqualTo(before);
            }
        }
        for (String path : List.of("/description", "/environmentPlan/rationale")) {
            var source = validSource(); remove(source, path);
            assertThatThrownBy(() -> validator.validateGeneratedTextJson(source))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details())
                            .containsEntry("path", path).containsEntry("submittedMissing", true).containsEntry("submittedNull", false)
                            .containsEntry("submittedType", "MISSING"));
        }
    }

    @Test void typed_text_validation_keeps_exact_paths_without_inventing_raw_missing_presence() {
        for (String path : List.of("/description", "/environmentPlan/rationale", "/briefing/0", "/checkoutDialogue/1")) {
            var source = validSource(); set(source, path, mapper.valueToTree(" "));
            var draft = mapper.treeToValue(source, MarketAiQuestDraft.class);
            assertThatThrownBy(() -> validator.validateGenerated(draft, 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details())
                            .containsEntry("code", "INVALID_TEXT_LENGTH").containsEntry("path", path)
                            .containsEntry("rawFieldPresenceRecorded", false).doesNotContainKey("submittedMissing"));
        }
    }

    @Test void preserved_missing_description_then_rationle_typo_retries_three_times_until_ai_supplies_correct_keys() throws Exception {
        var failures = firstTwoFailures();
        var corrected = validSource(); String correctedRaw = mapper.writeValueAsString(corrected);
        var harness = new Harness();
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(
                output(failures.get(0)), output(failures.get(1)), output(correctedRaw));
        var response = harness.service.generate(harness.member);
        var prompts = ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(3)).complete(anyString(), prompts.capture(), eq(1200), eq(0.2));
        verify(harness.client).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        assertThat(prompts.getAllValues().get(1)).contains("INVALID_TEXT_LENGTH", "/description", "requiredKey", "submittedMissing", "Apply requiredKey/expectedType/length/numeric bounds");
        assertThat(prompts.getAllValues().get(2)).contains("/environmentPlan/rationale", "rationale", "submittedMissing", "requiredKey");
        assertThat(prompts.getAllValues().get(1)).contains("Rejected candidate data", mapper.writeValueAsString(mapper.readTree(failures.get(0))));
        assertThat(prompts.getAllValues().get(2)).contains("Rejected candidate data", mapper.writeValueAsString(mapper.readTree(failures.get(1))));
        assertThat(response.quest().description()).isEqualTo(corrected.path("description").asString());
        assertThat(response.quest().environmentPlan().rationale()).isEqualTo(corrected.path("environmentPlan").path("rationale").asString());
        assertThat(response.promptVersion()).isEqualTo(MarketAiQuestPromptFactory.PROMPT_VERSION);
        @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
        verify(harness.audit).record(eq(harness.member), any(), eq(response), any(), attempts.capture(), isNull(), anyString());
        assertThat(attempts.getValue()).hasSize(3);
        assertThat(attempts.getValue().get(0).rawOutput()).isEqualTo(failures.get(0));
        assertThat(attempts.getValue().get(1).rawOutput()).isEqualTo(failures.get(1));
        assertThat(attempts.getValue().get(2).rawOutput()).isEqualTo(correctedRaw);
        assertThat(attempts.getValue().get(0).validationDetails()).containsEntry("path", "/description");
        assertThat(attempts.getValue().get(1).validationDetails()).containsEntry("path", "/environmentPlan/rationale");
        assertThat(mapper.readTree(failures.get(0)).has("description")).isFalse();
        assertThat(mapper.readTree(failures.get(1)).path("environmentPlan").has("rationale")).isFalse();
        assertThat(mapper.readTree(failures.get(1)).path("environmentPlan").has("rationle")).isTrue();
        evidence(failures, correctedRaw, prompts.getAllValues(), attempts.getValue());
    }

    @Test void previous_v22_cached_quest_is_not_returned_as_v23_validated_content() {
        var harness = new Harness();
        var old = mock(MarketAiQuestResponse.class); when(old.promptVersion()).thenReturn("market-ai-quest-v22-strict-selection");
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(old));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2)))
                .thenReturn(output(mapper.writeValueAsString(validSource())));
        var response = harness.service.generate(harness.member);
        assertThat(response).isNotSameAs(old);
        assertThat(response.promptVersion()).isEqualTo(MarketAiQuestPromptFactory.PROMPT_VERSION);
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.client).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
    }

    private List<String> firstTwoFailures() throws Exception {
        String sourcePath = System.getProperty("oneuldo.test.field-failure-fixture");
        if (sourcePath != null) {
            var fixture = mapper.readTree(Files.readString(Path.of(sourcePath)));
            return List.of(fixture.path("attempts").get(0).path("rawOutput").asString(), fixture.path("attempts").get(1).path("rawOutput").asString());
        }
        var first = validSource(); first.remove("description");
        var plan = (ObjectNode) first.path("environmentPlan"); plan.set("rationle", plan.remove("rationale"));
        var second = first.deepCopy(); second.put("description", "흰 우유와 바나나를 선택해요.");
        return List.of(mapper.writeValueAsString(first), mapper.writeValueAsString(second));
    }

    private void set(ObjectNode source, String pointer, JsonNode value) {
        int split = pointer.lastIndexOf('/'); String field = pointer.substring(split + 1);
        JsonNode parent = split == 0 ? source : source.at(pointer.substring(0, split));
        if (parent instanceof ObjectNode object) object.set(field, value);
        else ((tools.jackson.databind.node.ArrayNode)parent).set(Integer.parseInt(field), value);
    }

    private void remove(ObjectNode source, String pointer) {
        int split = pointer.lastIndexOf('/'); ((ObjectNode)(split == 0 ? source : source.at(pointer.substring(0, split)))).remove(pointer.substring(split + 1));
    }

    private ObjectNode validSource() {
        return (ObjectNode)mapper.valueToTree(new MarketAiQuestDraft(2, "S01", "아침 준비 연습", "흰 우유와 바나나를 선택해요.", 7000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("banana", 1)),
                List.of("흰 우유 900mL 1개와 바나나 1송이를 담아요."),
                List.of("목표 수량과 장바구니를 비교해요.", "다르면 다시 고르기로 돌아가 수정해요."), "연습을 마쳤어요.",
                "동일 품목과 비교·수정 안내를 유지해 두 목표 상품을 선택하는지 관찰해요.", List.of("GUIDED_PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "현재 상품군 자리를 유지해 선택을 관찰해요."), 300));
    }

    private GroqChatClient.GroqChatResult output(String raw) { return new GroqChatClient.GroqChatResult(raw, "mock-provider"); }

    private void evidence(List<String> preserved, String corrected, List<String> prompts, List<MarketAiQuestGeneration.Attempt> attempts) throws Exception {
        String directory = System.getProperty("oneuldo.test.source-evidence-dir"); if (directory == null) return;
        var record = mapper.createObjectNode().put("executionKind", "MOCK_PROVIDER_PRESERVED_FAILURE_REGRESSION")
                .put("actualModelCalls", 0).put("newActualPlays", 0).put("actualPreservedFixtureUsed", System.getProperty("oneuldo.test.field-failure-fixture") != null);
        record.set("firstTwoOriginalRawOutputs", mapper.valueToTree(preserved)); record.put("thirdMockAiOutput", corrected);
        record.set("submittedPrompts", mapper.valueToTree(prompts)); record.set("auditedAttempts", mapper.valueToTree(attempts));
        var path = Path.of(directory); Files.createDirectories(path); Files.writeString(path.resolve("text-field-feedback-preserved-regression.json"), mapper.writeValueAsString(record));
    }

    private class Harness {
        final UUID member = UUID.randomUUID();
        final GroqChatClient client = mock(GroqChatClient.class);
        final MarketAiQuestAuditService audit = mock(MarketAiQuestAuditService.class);
        final MarketAiQuestService service;
        Harness() {
            var profileId = UUID.randomUUID(); var rec = mock(MarketDifficultyRecommendationResponse.class);
            when(rec.profileId()).thenReturn(profileId); when(rec.recommendedDifficulty()).thenReturn(2);
            when(rec.adjustments()).thenReturn(new MarketDifficultyRecommendationResponse.Adjustments(2, "LOW", "LOW", "SIMPLIFIED"));
            var recommendations = mock(MarketDifficultyRecommendationService.class); when(recommendations.recommend(member)).thenReturn(rec);
            var profile = mock(AiUserProfileResponse.class); when(profile.profileId()).thenReturn(profileId);
            when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
            var profiles = mock(AiUserProfileService.class); when(profiles.find(member, profileId)).thenReturn(profile);
            var prompts = spy(new MarketAiQuestPromptFactory(mapper)); doReturn("{}").when(prompts).userPrompt(any(), any());
            when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
            service = new MarketAiQuestService(prompts, validator, recommendations, audit, profiles, client, mapper, mock(PracticeHistoryService.class));
        }
    }
}
