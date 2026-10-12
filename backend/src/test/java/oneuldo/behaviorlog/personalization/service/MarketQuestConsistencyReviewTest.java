package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class MarketQuestConsistencyReviewTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();

    @Test void source_facts_count_purchase_units_preserve_old_hints_and_ignore_sentence_splits() {
        var draft = draft("같은 8개 구매 조건과 중립 안내를 유지해 규격과 구매 수의 동시 선택을 재확인해요.");
        var prompt = historyPrompt(draft);
        var old = (ObjectNode)prompt.path("practiceHistory").get(0).path("recordedPractice").path("tasks").get(0).path("mission");
        old.set("briefing", mapper.valueToTree(List.of("흰 우유 900mL 2개, 바나나 1송이를 골라요.", "즉석밥 3개입 2개, 생수 500mL 3개를 골라요.")));
        var input = MarketQuestConsistencyReview.context(mapper, draft, prompt, null);
        assertThat(input.path("candidateFacts").path("objectiveQuantityTotal").asInt()).isEqualTo(8);
        assertThat(input.path("candidateFacts").path("objectiveCostTotal").asInt()).isEqualTo(19400);
        assertThat(input.path("candidateFacts").path("budgetSlack").asInt()).isEqualTo(2600);
        assertThat(input.path("candidateFacts").path("plannedSlotAssignments").get(0).has("x")).isFalse();
        var source = input.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0);
        assertThat(source.path("objectiveQuantityTotal").asInt()).isEqualTo(8);
        assertThat(source.path("literalComparisonToCandidate").path("sameObjectivesAndQuantities").asBoolean()).isTrue();
        assertThat(source.path("literalComparisonToCandidate").path("sameInstructionTextIgnoringWhitespaceAndSentenceSplits").asBoolean()).isTrue();
        assertThat(source.path("literalComparisonToCandidate").has("sameTimeLimit")).isFalse();
        assertThat(input.toString()).doesNotContain("abilityImproved", "fading", "supportDecreased");
        old.set("checkoutDialogue", mapper.valueToTree(List.of("목록과 숫자를 비교해요.", "다르면 다시 고르기로 돌아가 바꿔요.")));
        var changed = MarketQuestConsistencyReview.context(mapper, draft, prompt, null);
        assertThat(changed.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0).path("mission").path("checkoutDialogue").get(1).asString())
                .isEqualTo("다르면 다시 고르기로 돌아가 바꿔요.");
        assertThat(changed.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0).path("literalComparisonToCandidate")
                .path("sameInstructionTextIgnoringWhitespaceAndSentenceSplits").asBoolean()).isFalse();
        assertThat(prompt.path("practiceHistory").get(0).path("recordedPractice").path("tasks").get(0).path("mission")).isEqualTo(old);
    }

    @Test void ai_factual_repair_removes_a_false_10_unit_and_new_fading_claim_without_changing_the_selected_conditions() {
        var bad = draft("이전 8개에서 총 10개로 수량 복잡도를 높이고 목표 목록 외 힌트를 새로 제거해요.");
        var corrected = draft("이전과 같은 4품목 8개와 중립 안내를 유지해 규격과 구매 수를 함께 고르는 수행의 재현성을 추가 관찰해요.");
        var harness = new Harness(historyPrompt(bad));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(bad), output(corrected));
        var reviews = new ArrayList<String>();
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> {
            String prompt = call.getArgument(1); reviews.add(prompt);
            return mapper.readTree(prompt).path("deliveredQuest").path("adaptationSummary").asString().contains("총 10개") ? rejectedReview(prompt) : MarketQuestReviewFixtures.valid(mapper, prompt);
        });
        var response = harness.service.generate(harness.member);
        var generationPrompts = ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(2)).complete(anyString(), generationPrompts.capture(), eq(1200), eq(0.2));
        verify(harness.client, times(3)).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        assertThat(generationPrompts.getAllValues().get(1)).contains("AI_QUEST_CONSISTENCY_MISMATCH", "objectiveQuantityTotal", "19400",
                "QUANTITY_CLAIM_MISMATCH", "SUPPORT_CLAIM_MISMATCH", "rejectedQuest", "서버가 상품·수량·시간을 대신 선택하거나 보정하지");
        assertThat(response.quest().objectives()).isEqualTo(bad.objectives());
        assertThat(response.quest().timeLimitSeconds()).isEqualTo(421);
        assertThat(response.quest().budget()).isEqualTo(22000);
        assertThat(response.quest().environmentPlan()).isEqualTo(bad.environmentPlan());
        assertThat(response.adaptationSummary()).isEqualTo(corrected.adaptationSummary());
        assertThat(bad.adaptationSummary()).contains("총 10개");
        @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
        verify(harness.audit).record(eq(harness.member), any(), eq(response), eq(corrected), attempts.capture(), isNull(), anyString());
        assertThat(attempts.getValue()).hasSize(2);
        assertThat(attempts.getValue().getFirst().rawOutput()).isEqualTo(mapper.writeValueAsString(bad));
        assertThat(attempts.getValue().getFirst().validationDetails()).containsKey("reviewOutput");
        assertThat(attempts.getValue().getLast().validationDetails()).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED").containsKey("adaptationPlan");
    }

    @Test void same_conditions_with_an_ai_chosen_unanswered_observation_question_can_pass_without_progression_or_shelf_changes() {
        var chosen = draft("조건을 유지해 규격과 구매 수를 함께 고르는 수행이 다시 재현되는지 관찰해요.");
        var harness = new Harness(historyPrompt(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(chosen));
        var result = harness.service.generate(harness.member);
        assertThat(result.quest().objectives()).isEqualTo(chosen.objectives());
        assertThat(result.quest().environmentPlan()).isEqualTo(chosen.environmentPlan());
        assertThat(result.adaptationSummary()).isEqualTo(chosen.adaptationSummary());
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.client).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
    }

    @Test void malformed_review_is_rechecked_without_regenerating_the_valid_candidate() {
        var chosen=draft("같은 구매 조건의 미해결 관찰 질문을 추가 확인해요.");
        var harness=new Harness(historyPrompt(chosen));
        when(harness.client.complete(anyString(),anyString(),eq(1200),eq(0.2))).thenReturn(output(chosen));
        var count=new java.util.concurrent.atomic.AtomicInteger();
        when(harness.client.complete(anyString(),anyString(),eq(MarketAiQuestService.REVIEW_MAX_TOKENS),eq(0.0))).thenAnswer(call->{
            var valid=MarketQuestReviewFixtures.valid(mapper,call.getArgument(1));
            if(count.incrementAndGet()!=1)return valid;
            var invalid=(ObjectNode)mapper.readTree(valid.text());invalid.put("objectiveQuantityTotal","8");
            return new GroqChatClient.GroqChatResult(invalid.toString(),"test-model");
        });
        var result=harness.service.generate(harness.member);
        assertThat(result.quest().objectives()).isEqualTo(chosen.objectives());
        assertThat(result.adaptationSummary()).isEqualTo(chosen.adaptationSummary());
        verify(harness.client).complete(anyString(),anyString(),eq(1200),eq(0.2));
        verify(harness.client,times(2)).complete(anyString(),anyString(),eq(MarketAiQuestService.REVIEW_MAX_TOKENS),eq(0.0));
        verify(harness.audit).record(eq(harness.member),any(),eq(result),eq(chosen),argThat(attempts->attempts.size()==1
            && attempts.getFirst().validationDetails().get("reviewAttempts") instanceof List<?> reviews && reviews.size()==2),isNull(),anyString());
    }

    @Test void review_totals_must_be_exact_integers_and_issue_pointers_must_resolve_to_sources() {
        var chosen = draft("구매 조건을 유지하며 규격과 수량의 동시 선택을 관찰해요.");
        var input = MarketQuestConsistencyReview.context(mapper, chosen, historyPrompt(chosen), null);
        var approval = mapper.readTree(MarketQuestReviewFixtures.valid(mapper, new MarketAiQuestPromptFactory(mapper).consistencyReviewPrompt(input)).text());
        for (String value : List.of("10", "8.0", "\"8\"")) {
            var invalid = (ObjectNode)approval.deepCopy(); invalid.set("objectiveQuantityTotal", mapper.readTree(value));
            assertThatThrownBy(() -> validator.validateConsistencyReview(mapper, invalid, input))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e ->
                            assertThat(e.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID"));
        }
        var rejected = (ObjectNode)mapper.readTree(rejectedReview(new MarketAiQuestPromptFactory(mapper).consistencyReviewPrompt(input)).text());
        ((ObjectNode)rejected.path("issues").get(0)).set("sourcePaths", mapper.valueToTree(List.of("/invented/ability")));
        assertThatThrownBy(() -> validator.validateConsistencyReview(mapper, rejected, input)).isInstanceOf(MarketQuestValidationException.class);
        assertThat(validator.validateConsistencyReview(mapper, approval, input)).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
    }

    @Test void five_candidates_are_bounded_to_two_independent_reviews_each_without_an_automatic_quest() {
        var chosen = draft("총 10개로 수량 복잡도를 높여요.");
        var harness = new Harness(historyPrompt(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> rejectedReview(call.getArgument(1)));
        assertThatThrownBy(() -> harness.service.generate(harness.member)).isInstanceOf(ResponseStatusException.class);
        verify(harness.client, times(5)).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.client, times(10)).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        verify(harness.audit).record(eq(harness.member), any(), argThat(r -> r.quest() == null && r.source().equals("FAILED")), isNull(),
                argThat(attempts -> attempts.size() == 5 && attempts.stream().allMatch(a -> a.validationDetails().get("code").equals("AI_QUEST_CONSISTENCY_MISMATCH"))),
                eq("AI_QUEST_FAILED"), anyString());
    }

    @Test void unavailable_reviewer_preserves_candidate_audit_and_returns_failure_without_delivery() {
        var chosen = draft("구매 단위 선택을 관찰해요.");
        var harness = new Harness(historyPrompt(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenThrow(new IllegalStateException("offline"));
        assertThatThrownBy(() -> harness.service.generate(harness.member)).isInstanceOf(ResponseStatusException.class);
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.client).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        verify(harness.audit).record(eq(harness.member), any(), any(), isNull(), argThat(attempts -> attempts.size() == 1
                && attempts.getFirst().rawOutput().equals(mapper.writeValueAsString(chosen))
                && attempts.getFirst().failureReason().equals("AI_REVIEW_UNAVAILABLE")), eq("AI_QUEST_FAILED"), anyString());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void oversized_review_is_preserved_without_priming_review_repair_or_regenerating_the_candidate(boolean malformedJson) {
        var chosen = draft("같은 조건에서 규격과 구매 수를 관찰해요.");
        var harness = new Harness(historyPrompt(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(chosen));
        var reviewOutputs = new ArrayList<String>();
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> {
            var valid = MarketQuestReviewFixtures.valid(mapper, call.getArgument(1));
            if (!reviewOutputs.isEmpty()) return valid;
            var oversized = (ObjectNode)mapper.readTree(valid.text());
            oversized.put("extra", "source-data-".repeat(1500) + "OVERSIZED_REVIEW_TAIL_MUST_STAY_IN_AUDIT");
            String raw = malformedJson ? "not-json-source-".repeat(1000) + "OVERSIZED_REVIEW_TAIL_MUST_STAY_IN_AUDIT"
                    : mapper.writeValueAsString(oversized);
            reviewOutputs.add(raw);
            return new GroqChatClient.GroqChatResult(raw, "oversize-review");
        });
        var result = harness.service.generate(harness.member);
        var prompts = ArgumentCaptor.forClass(String.class);
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        verify(harness.client, times(2)).complete(anyString(), prompts.capture(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        String feedbackPrompt = prompts.getAllValues().get(1);
        assertThat(feedbackPrompt).doesNotContain("OVERSIZED_REVIEW_TAIL_MUST_STAY_IN_AUDIT");
        assertThat(mapper.readTree(feedbackPrompt).path("reviewRepairInstruction").isMissingNode()).isTrue();
        assertThat(result.quest().objectives()).isEqualTo(chosen.objectives());
        @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
        verify(harness.audit).record(eq(harness.member), any(), eq(result), eq(chosen), attempts.capture(), isNull(), anyString());
        assertThat(attempts.getValue().getFirst().rawOutput()).isEqualTo(mapper.writeValueAsString(chosen));
        var reviews=(List<?>)attempts.getValue().getFirst().validationDetails().get("reviewAttempts");
        assertThat(((Map<?,?>)reviews.getFirst()).get("rawOutput")).isEqualTo(reviewOutputs.getFirst());
    }

    @Test void decimal_quantity_is_rejected_before_conversion_and_ai_repair_selects_the_integer() {
        var chosen = draft("규격과 구매 수의 동시 선택을 관찰해요.");
        var harness = new Harness(historyPrompt(chosen));
        var wrong = (ObjectNode)mapper.valueToTree(chosen);
        ((ObjectNode)wrong.path("objectives").get(0)).put("quantity", 2.9);
        String raw = mapper.writeValueAsString(wrong);
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2)))
                .thenReturn(new GroqChatClient.GroqChatResult(raw, "test"), output(chosen));
        var result = harness.service.generate(harness.member);
        var prompts = ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(2)).complete(anyString(), prompts.capture(), eq(1200), eq(0.2));
        verify(harness.client).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        assertThat(prompts.getAllValues().get(1)).contains("NUMERIC_FIELD_MUST_BE_INTEGER", "/objectives/0/quantity", "서버는 반올림·절삭·문자 변환");
        assertThat(result.quest().objectives()).isEqualTo(chosen.objectives());
        assertThat(wrong.path("objectives").get(0).path("quantity").asDouble()).isEqualTo(2.9);
        @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
        verify(harness.audit).record(eq(harness.member), any(), eq(result), eq(chosen), attempts.capture(), isNull(), anyString());
        assertThat(attempts.getValue().getFirst().rawOutput()).isEqualTo(raw);
        assertThat(attempts.getValue().getFirst().validationDetails()).containsEntry("path", "/objectives/0/quantity");
    }

    @Test void prompts_check_actual_conditions_and_allow_an_ai_decision_to_repeat() {
        var factory = new MarketAiQuestPromptFactory(mapper);
        assertThat(factory.systemPrompt()).contains("실제 상품·수량 합계", "품목 수 감소는 과제 부담 변화", "반복은 AI가");
        assertThat(factory.consistencyReviewSystemPrompt()).contains("이전에도 중립 안내", "문장 수·줄바꿈·품목 감소", "성공 횟수로 다음 단계나 변경을 강제하지");
        var input = MarketQuestConsistencyReview.context(mapper, draft("규격 연습"), historyPrompt(draft("규격 연습")), null);
        assertThat(factory.consistencyReviewPrompt(input)).contains("총 10개", "합계가 8", "반복이면 실제 이력",
                "목표·수량·예산·배치·추가 힌트 변경", "과거 제한 시간이 미기록이면 이번에 정한 시간 조건",
                "미기록 과거 조건을 유지됐다고 확정하지", "수량·안내가 같아도 예산·시간까지 같다고 쓰지");
    }

    @Test void preserved_false_valid_budget_review_cannot_deliver_unchanged_6000_to_7000_and_ai_repairs_the_claim() throws Exception {
        String fixture = System.getProperty("oneuldo.test.budget-false-valid-fixture");
        String timerSource = System.getProperty("oneuldo.test.budget-timer-source");
        org.junit.jupiter.api.Assumptions.assumeTrue(fixture != null && timerSource != null, "Operator-preserved synthetic timer artifacts are optional in CI");
        var recorded = mapper.readTree(java.nio.file.Files.readString(java.nio.file.Path.of(fixture)));
        String originalRaw = recorded.path("attempts").get(0).path("rawOutput").asString();
        String originalReview = recorded.path("attempts").get(0).path("validationDetails").path("reviewOutput").asString();
        var selected = mapper.treeToValue(mapper.readTree(originalRaw), MarketAiQuestDraft.class);
        var sourceRequests = mapper.readTree(java.nio.file.Files.readString(java.nio.file.Path.of(timerSource)));
        var sourceMission = sourceRequests.path("requests").get(0).path("payload").path("marketContent").path("missionSnapshot");
        assertThat(sourceMission.path("budget").asInt()).isEqualTo(6000);
        var prompt = mapper.createObjectNode();
        prompt.putObject("aiDifficultyRecommendation").putObject("adjustments").put("textSupport", "SIMPLIFIED");
        var play = prompt.putArray("practiceHistory").addObject().put("currentSession", true).put("sourceAvailable", true).put("playOrder", 1);
        play.putObject("recordedPractice").putArray("tasks").addObject().set("mission", sourceMission.deepCopy());
        var input = MarketQuestConsistencyReview.context(mapper, selected, prompt, null);
        assertThatThrownBy(() -> validator.validateConsistencyReview(mapper, mapper.readTree(originalReview), input))
                .isInstanceOf(MarketQuestValidationException.class); // Older unstructured VALID is not a v24 approval.
        var structuredReview = (ObjectNode)mapper.readTree(originalReview);
        var claim = structuredReview.putObject("budgetClaim").put("quote", selected.adaptationSummary()).put("relation", "UNCHANGED")
                .put("sourceBudget", 6000).put("proposedBudget", 7000);
        claim.set("sourcePath", input.path("budgetComparisonSource").path("sourcePath").deepCopy());
        assertThatThrownBy(() -> validator.validateConsistencyReview(mapper, structuredReview, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_MISMATCH"));
        var corrected = (ObjectNode)mapper.readTree(originalRaw);
        corrected.put("adaptationSummary", "이전 목표 품목은 유지하고 예산은 6,000원에서 7,000원으로 늘려요. 제한 시간 300초와 비교·수정 안내 조건에서 두 상품 선택을 관찰해요.");
        var harness = new Harness(prompt, 2);
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2)))
                .thenReturn(new GroqChatClient.GroqChatResult(originalRaw, "mock-provider"), new GroqChatClient.GroqChatResult(corrected.toString(), "mock-provider"));
        var seen = new ArrayList<String>();
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> {
            seen.add(call.getArgument(1));
            if (seen.size() == 1) return new GroqChatClient.GroqChatResult(structuredReview.toString(), "mock-review");
            var approval = (ObjectNode)mapper.readTree(MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)).text());
            ((ObjectNode)approval.path("budgetClaim")).put("relation", "INCREASED");
            ((ObjectNode)approval.path("adaptationPlan")).putArray("deliveredChanges").add("예산 6,000원에서 7,000원으로 증가");
            return new GroqChatClient.GroqChatResult(approval.toString(), "mock-review");
        });
        var response = harness.service.generate(harness.member);
        var generationPrompts = ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(2)).complete(anyString(), generationPrompts.capture(), eq(1200), eq(0.2));
        verify(harness.client, times(2)).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        assertThat(generationPrompts.getAllValues().get(1)).contains("BUDGET_CLAIM_MISMATCH", "UNCHANGED", "6000", "7000", "실제 예산 또는 설명을 AI가 다시 선택");
        assertThat(response.quest().budget()).isEqualTo(7000);
        assertThat(response.adaptationSummary()).isEqualTo(corrected.path("adaptationSummary").asString());
        @SuppressWarnings("unchecked") var attempts = (ArgumentCaptor<List<MarketAiQuestGeneration.Attempt>>)(ArgumentCaptor<?>)ArgumentCaptor.forClass(List.class);
        verify(harness.audit).record(eq(harness.member), any(), eq(response), any(), attempts.capture(), isNull(), anyString());
        assertThat(attempts.getValue().getFirst().rawOutput()).isEqualTo(originalRaw);
        assertThat(attempts.getValue().getFirst().validationDetails().get("reviewOutput")).isEqualTo(structuredReview.toString());
        assertThat(recorded.path("attempts").get(0).path("validationDetails").path("reviewOutput").asString()).isEqualTo(originalReview);
        String directory = System.getProperty("oneuldo.test.source-evidence-dir");
        if (directory != null) {
            var evidence = mapper.createObjectNode().put("executionKind", "MOCK_PROVIDER_PRESERVED_FALSE_VALID_PROTOCOL_REGRESSION")
                    .put("actualModelCalls", 0).put("newActualPlays", 0).put("originalGeneratorRaw", originalRaw)
                    .put("originalV23FalseValidRaw", originalReview).put("testOnlyV24StructuredReview", structuredReview.toString());
            evidence.set("originalMission", sourceMission.deepCopy()); evidence.set("submittedGeneratorPrompts", mapper.valueToTree(generationPrompts.getAllValues()));
            evidence.set("auditedAttempts", mapper.valueToTree(attempts.getValue()));
            var path = java.nio.file.Path.of(directory); java.nio.file.Files.createDirectories(path);
            java.nio.file.Files.writeString(path.resolve("budget-claim-preserved-false-valid-regression.json"), evidence.toString());
        }
    }

    private MarketAiQuestDraft draft(String summary) {
        return new MarketAiQuestDraft(2, "CUSTOM", "독립 구매 연습", "목표 목록에 따라 골라요.", 22000,
                List.of(new MarketAiQuestDraft.Objective("milk", 2), new MarketAiQuestDraft.Objective("banana", 1),
                        new MarketAiQuestDraft.Objective("instant-rice", 2), new MarketAiQuestDraft.Objective("water", 3)),
                List.of("흰 우유 900mL 2개, 바나나 1송이를 골라요. 즉석밥 3개입 2개, 생수 500mL 3개를 골라요."),
                List.of("장보기를 마쳤다면 제출해요.", "계속 장보거나 중단을 선택할 수 있어요."), "연습을 마쳤어요.", summary, List.of("OBSERVATION_PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "같은 상품군 자리를 유지해 규격 선택을 추가 관찰해요."), 421);
    }

    @org.junit.jupiter.api.Test void real_history_codec_is_decoded_before_mission_and_budget_review() {
        var chosen = draft("같은 품목과 수량으로 규격 선택 과정을 추가 관찰해요.");
        var plain = historyPrompt(chosen);
        var encoded = (ObjectNode) oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding.encode(mapper, plain);
        assertThat(encoded.path("historySourceEncodingVersion").asString()).isNotBlank();
        // The real withPracticeHistory path encodes this raw history once.
        var harness = new Harness(plain);
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(chosen));
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> {
            var input = mapper.readTree((String) call.getArgument(1));
            assertThat(input.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0).path("mission"))
                    .isEqualTo(plain.path("practiceHistory").get(0).path("recordedPractice").path("tasks").get(0).path("mission"));
            assertThat(input.path("budgetComparisonSource").path("sourceBudget").asInt()).isEqualTo(chosen.budget());
            assertThat(input.path("budgetComparisonSource").path("sourcePath").asString())
                    .isEqualTo("/practiceHistoryFacts/0/recordedTasks/0/mission/budget");
            return MarketQuestReviewFixtures.valid(mapper, (String) call.getArgument(1));
        });
        assertThat(harness.service.generate(harness.member).quest().objectives()).isEqualTo(chosen.objectives());
    }

    private ObjectNode historyPrompt(MarketAiQuestDraft draft) {
        var prompt = mapper.createObjectNode();
        prompt.putObject("aiDifficultyRecommendation").putObject("adjustments").put("textSupport", "REDUCED");
        var play = prompt.putArray("practiceHistory").addObject().put("sessionId", UUID.randomUUID().toString()).put("playOrder", 1).put("sourceAvailable", true);
        var source = play.putObject("recordedPractice");
        var mission = (ObjectNode)mapper.valueToTree(draft); mission.remove("timeLimitSeconds");
        source.putArray("tasks").addObject().set("mission", mission);
        source.putArray("purchaseEvents").addObject().put("eventCode", "SHOP.CHECKOUT_SUBMITTED");
        return prompt;
    }

    private GroqChatClient.GroqChatResult output(MarketAiQuestDraft draft) {
        return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(draft), "test");
    }

    private GroqChatClient.GroqChatResult rejectedReview(String prompt) {
        var approval = (ObjectNode)mapper.readTree(MarketQuestReviewFixtures.valid(mapper, prompt).text());
        approval.put("verdict", "REPAIR");
        var issues = approval.putArray("issues");
        issues.addObject().put("code", "QUANTITY_CLAIM_MISMATCH").put("path", "/adaptationSummary")
                .put("explanation", "최종 구매 단위 합계는 이전과 같은 8개이며 총 10개 또는 수량 상승 설명을 뒷받침하지 않아요.")
                .set("sourcePaths", mapper.valueToTree(List.of("/candidateFacts/objectiveQuantityTotal", "/practiceHistoryFacts/0/recordedTasks/0/objectiveQuantityTotal")));
        issues.addObject().put("code", "SUPPORT_CLAIM_MISMATCH").put("path", "/adaptationSummary")
                .put("explanation", "이전과 같은 중립 안내여서 새 도움 감소가 아닌 유지 목적을 설명해야 해요.")
                .set("sourcePaths", mapper.valueToTree(List.of("/practiceHistoryFacts/0/recordedTasks/0/mission/checkoutDialogue", "/deliveredQuest/checkoutDialogue")));
        return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(approval), "test-review");
    }

    private class Harness {
        final UUID member = UUID.randomUUID();
        final GroqChatClient client = mock(GroqChatClient.class);
        final MarketAiQuestAuditService audit = mock(MarketAiQuestAuditService.class);
        final MarketAiQuestService service;
        Harness(ObjectNode sourcePrompt) { this(sourcePrompt, 4); }
        Harness(ObjectNode sourcePrompt, int itemCount) {
            var profileId = UUID.randomUUID();
            var recommendation = new MarketDifficultyRecommendationResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), profileId, 1,
                    "MARKET_SIMULATION", 2, "AI_PROFILE", new MarketDifficultyRecommendationResponse.Adjustments(itemCount, "LOW", "LOW", "REDUCED"), List.of("PRACTICE"), "test", java.time.Instant.now());
            var recommendations = mock(MarketDifficultyRecommendationService.class);
            when(recommendations.recommend(member)).thenReturn(recommendation);
            var profile = mock(AiUserProfileResponse.class);
            when(profile.profileId()).thenReturn(profileId); when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
            var profiles = mock(AiUserProfileService.class); when(profiles.find(member, profileId)).thenReturn(profile);
            var prompts = spy(new MarketAiQuestPromptFactory(mapper));
            doReturn(mapper.writeValueAsString(sourcePrompt)).when(prompts).userPrompt(any(), any());
            var history = mock(PracticeHistoryService.class); when(history.forProfile(member, profile)).thenReturn((tools.jackson.databind.node.ArrayNode)sourcePrompt.path("practiceHistory"));
            when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
            service = new MarketAiQuestService(prompts, validator, recommendations, audit, profiles, client, mapper, history);
        }
    }
}
