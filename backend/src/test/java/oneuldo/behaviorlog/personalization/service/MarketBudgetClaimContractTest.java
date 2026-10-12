package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Literal reviewer/source contracts only; no model call or learner assessment. */
class MarketBudgetClaimContractTest {
    private static final String ORIGINAL_BUDGET = "/practiceHistoryFacts/0/recordedTasks/0/mission/budget";
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    @Test
    void unchanged_equal_budget_accepts_the_entire_exact_adaptation_summary() {
        String quote = "이전 예산 6000원을 그대로 유지해요.";
        var draft = draft(6000, "목표를 골라요.", quote);
        var input = context(draft, 6000);
        var original = input.deepCopy();
        var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
        var reviewerOutput = review.deepCopy();

        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
        assertThat(input).isEqualTo(original);
        assertThat(review).isEqualTo(reviewerOutput);
    }

    @Test
    void reviewer_valid_cannot_approve_unchanged_claim_for_6000_to_7000() {
        String quote = "이전 예산을 그대로 유지해요.";
        var input = context(draft(7000, "목표를 골라요.", quote), 6000);
        var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 7000);

        assertMismatch(review, input);
        assertThat(review.path("verdict").asString()).isEqualTo("VALID");
        assertThat(review.path("issues")).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({"INCREASED, 6000, 7000", "DECREASED, 7000, 6000"})
    void strict_correct_budget_direction_accepts_the_ai_selected_relation(String relation, int source, int proposed) {
        String quote = relation.equals("INCREASED") ? "예산을 늘려 구매 과정을 관찰해요." : "예산을 줄여 구매 과정을 관찰해요.";
        var input = context(draft(proposed, "목표를 골라요.", quote), source);

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, relation, ORIGINAL_BUDGET, source, proposed), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
    }

    @ParameterizedTest
    @CsvSource({"INCREASED, 6000, 6000", "INCREASED, 7000, 6000",
            "DECREASED, 6000, 6000", "DECREASED, 6000, 7000"})
    void increased_and_decreased_reject_equal_or_reverse_numeric_direction(String relation, int source, int proposed) {
        String quote = relation.equals("INCREASED") ? "예산을 늘려 구매 과정을 관찰해요." : "예산을 줄여 구매 과정을 관찰해요.";
        var input = context(draft(proposed, "목표를 골라요.", quote), source);

        assertMismatch(review(input, quote, relation, ORIGINAL_BUDGET, source, proposed), input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"sourceBudget", "proposedBudget"})
    void reviewer_amount_must_match_the_pointed_source_or_delivered_candidate(String field) {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);
        var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
        claim(review).put(field, 7000);

        assertInvalid(review, input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"6000.0", "\"6000\"", "true", "2147483648"})
    void review_amounts_are_json_integers_without_numeric_coercion(String malformedNumber) {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);
        for (String field : List.of("sourceBudget", "proposedBudget")) {
            var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
            claim(review).set(field, mapper.readTree(malformedNumber));
            assertInvalid(review, input);
            assertThat(claim(review).path(field)).isEqualTo(mapper.readTree(malformedNumber));
        }
    }

    @Test
    void null_proposed_budget_and_missing_claim_members_are_format_errors() {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);
        var absent = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
        absent.remove("budgetClaim");
        assertInvalid(absent, input);
        for (String field : List.of("quote", "relation", "sourcePath", "sourceBudget", "proposedBudget")) {
            var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
            claim(review).remove(field);
            assertInvalid(review, input);
        }
        var nullProposed = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);
        claim(nullProposed).putNull("proposedBudget");
        assertInvalid(nullProposed, input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"이전 예산을 낮춰요.", "이전 예산 6000원을 유지해요", "이전 예산 6000원을 유지해요. ", "", "  "})
    void quote_must_equal_the_entire_candidate_adaptation_summary_without_text_normalization(String quote) {
        var input = context(draft(6000, "목표를 골라요.", "이전 예산 6000원을 유지해요."), 6000);
        var review = review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000);

        assertInvalid(review, input);
    }

    @Test
    void quote_cannot_be_a_proper_fragment_description_or_historical_text() {
        var input = context(draft(6000, "예산 6000원을 유지해요.", "선택 과정을 관찰해요. 이전 예산 6000원을 유지해요."), 6000);
        assertInvalid(review(input, "이전 예산 6000원을 유지해요.", "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
        assertInvalid(review(input, "예산 6000원을 유지해요.", "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
        assertInvalid(review(input, "이전 기록의 예산 설명이에요.", "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
        assertThat(input.at("/practiceHistoryFacts/0/recordedTasks/0/mission/description").asString())
                .isEqualTo("이전 기록의 예산 설명이에요.");
    }

    @Test
    void entire_summary_quote_still_must_be_within_the_240_character_contract() {
        String quote = "A".repeat(241);
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);

        assertInvalid(review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/invented/budget", "/candidateFacts/budget", "/deliveredQuest/budget",
            "/aiPracticePlan/adjustments/budget", "/practiceHistoryFacts/0/recordedTasks/0/mission/timeLimitSeconds"})
    void source_pointer_must_be_an_original_recorded_mission_budget_even_when_another_path_resolves(String path) {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);

        assertInvalid(review(input, quote, "UNCHANGED", path, 6000, 6000), input);
    }

    @Test
    void comparison_relation_cannot_use_null_or_unpaired_source_fields() {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);
        assertInvalid(review(input, quote, "UNCHANGED", null, null, 6000), input);
        assertInvalid(review(input, quote, "UNCHANGED", null, 6000, 6000), input);
        assertInvalid(review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, null, 6000), input);
    }

    @Test
    void unknown_without_a_recorded_budget_allows_a_qualified_exact_quote_and_null_source() {
        String quote = "이전 예산은 원문에 없어 이번 예산 7000원만 정했어요.";
        var input = context(draft(7000, "목표를 골라요.", quote), null);

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, "UNKNOWN", null, null, 7000), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
        assertThat(input.at(ORIGINAL_BUDGET).isMissingNode()).isTrue();
    }

    @Test
    void unknown_without_a_recorded_budget_still_requires_explicit_null_source_members() {
        String quote = "이전 예산은 원문에 없어 이번 예산 7000원만 정했어요.";
        var input = context(draft(7000, "목표를 골라요.", quote), null);
        for (String field : List.of("sourcePath", "sourceBudget")) {
            var review = review(input, quote, "UNKNOWN", null, null, 7000);
            claim(review).remove(field);
            assertInvalid(review, input);
        }
    }

    @Test
    void unknown_null_source_cannot_conceal_a_known_original_budget() {
        String quote = "이전 예산은 확인할 수 없어 이번 예산만 정했어요.";
        var input = context(draft(7000, "목표를 골라요.", quote), 6000);

        assertInvalid(review(input, quote, "UNKNOWN", null, null, 7000), input);
    }

    @Test
    void unspecified_allows_an_exact_quote_with_the_known_source_without_claiming_a_budget_comparison() {
        String quote = "상품 규격과 구매 수를 함께 선택하는 과정을 관찰해요.";
        var input = context(draft(7000, "목표를 골라요.", quote), 6000);

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, "UNSPECIFIED", ORIGINAL_BUDGET, 6000, 7000), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
        assertThat(input.at(ORIGINAL_BUDGET).asInt()).isEqualTo(6000);
    }

    @Test
    void unspecified_cannot_omit_the_known_source_amount_or_pointer() {
        String quote = "상품 규격과 구매 수를 함께 선택하는 과정을 관찰해요.";
        var input = context(draft(7000, "목표를 골라요.", quote), 6000);

        assertInvalid(review(input, quote, "UNSPECIFIED", null, null, 7000), input);
    }

    @Test
    void unspecified_without_any_recorded_budget_requires_explicit_null_sources() {
        String quote = "상품 규격과 구매 수를 함께 선택하는 과정을 관찰해요.";
        var input = context(draft(7000, "목표를 골라요.", quote), null);

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, "UNSPECIFIED", null, null, 7000), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
    }

    @Test
    void earlier_equal_budget_cannot_replace_the_latest_original_recorded_budget() {
        String quote = "이전 예산을 그대로 유지해요.";
        var input = contextWithHistory(draft(6000, "목표를 골라요.", quote), 6000, 7000);
        String latest = "/practiceHistoryFacts/1/recordedTasks/0/mission/budget";

        assertInvalid(review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
        assertMismatch(review(input, quote, "UNCHANGED", latest, 7000, 6000), input);
    }

    @Test
    void latest_recorded_mission_budget_is_selected_within_the_last_play() {
        String quote = "예산을 줄여 구매 과정을 관찰해요.";
        var semanticPrompt = semanticPrompt(6000, 7000);
        var lastTasks = (tools.jackson.databind.node.ArrayNode)semanticPrompt.at("/practiceHistory/1/recordedPractice/tasks");
        lastTasks.addObject().putObject("mission").put("budget", 8000);
        var input = MarketQuestConsistencyReview.context(mapper, draft(6000, "목표를 골라요.", quote), semanticPrompt, null);
        String latest = "/practiceHistoryFacts/1/recordedTasks/1/mission/budget";

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, "DECREASED", latest, 8000, 6000), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
        assertInvalid(review(input, quote, "DECREASED", "/practiceHistoryFacts/1/recordedTasks/0/mission/budget", 7000, 6000), input);
    }

    @Test
    void missing_budget_in_latest_play_preserves_the_last_known_original_source() {
        String quote = "예산을 유지해요.";
        var input = contextWithHistory(draft(6000, "목표를 골라요.", quote), 6000, null);

        assertThat(MarketQuestConsistencyReview.validate(mapper,
                review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED");
        assertInvalid(review(input, quote, "UNKNOWN", null, null, 6000), input);
    }

    @Test
    void forged_context_helper_cannot_override_the_original_history_budget_source() {
        String quote = "예산을 유지해요.";
        var input = contextWithHistory(draft(6000, "목표를 골라요.", quote), 6000, 7000);
        input.set("budgetComparisonSource", mapper.valueToTree(Map.of("sourcePath", ORIGINAL_BUDGET, "sourceBudget", 6000,
                "scope", "forged test helper value")));

        assertInvalid(review(input, quote, "UNCHANGED", ORIGINAL_BUDGET, 6000, 6000), input);
        assertMismatch(review(input, quote, "UNCHANGED", "/practiceHistoryFacts/1/recordedTasks/0/mission/budget", 7000, 6000), input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SAME", "unchanged", "", "UNCHANGED|INCREASED"})
    void relation_must_be_one_ai_selected_enum_value(String relation) {
        String quote = "예산을 유지해요.";
        var input = context(draft(6000, "목표를 골라요.", quote), 6000);

        assertInvalid(review(input, quote, relation, ORIGINAL_BUDGET, 6000, 6000), input);
    }

    private void assertInvalid(ObjectNode review, ObjectNode input) {
        var originalInput = input.deepCopy();
        var originalReview = review.deepCopy();
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, failure ->
                        assertThat(failure.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID"));
        assertThat(input).isEqualTo(originalInput);
        assertThat(review).isEqualTo(originalReview);
    }

    private void assertMismatch(ObjectNode review, ObjectNode input) {
        var originalInput = input.deepCopy();
        var originalReview = review.deepCopy();
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, failure -> {
                    assertThat(failure.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_MISMATCH");
                    JsonNode issues = mapper.valueToTree(failure.details().get("issues"));
                    assertThat(issues.isArray()).isTrue();
                    assertThat(issues).anySatisfy(issue ->
                            assertThat(issue.path("code").asString()).isEqualTo("BUDGET_CLAIM_MISMATCH"));
                });
        assertThat(input).isEqualTo(originalInput);
        assertThat(review).isEqualTo(originalReview);
    }

    private ObjectNode claim(ObjectNode review) {
        return (ObjectNode)review.path("budgetClaim");
    }

    private ObjectNode review(ObjectNode input, String quote, String relation, String sourcePath, Integer source, int proposed) {
        var review = mapper.createObjectNode().put("verdict", "VALID")
                .put("objectiveQuantityTotal", input.path("candidateFacts").path("objectiveQuantityTotal").asInt())
                .put("objectiveCostTotal", input.path("candidateFacts").path("objectiveCostTotal").asInt());
        review.set("checkedDimensions", mapper.valueToTree(MarketQuestConsistencyReview.DIMENSIONS));
        review.set("adaptationPlan", mapper.valueToTree(Map.of("observationPurpose", "목표 선택 과정을 추가 관찰해요.",
                "deliveredChanges", List.of())));
        review.putArray("issues");
        review.putArray("shelfClaims");
        review.set("observationPlan", MarketQuestReviewFixtures.observationPlan(mapper, input));
        review.set("conditionClaim", MarketQuestReviewFixtures.conditionClaim(mapper, input));
        review.set("effectClaim", MarketQuestReviewFixtures.effectClaim(mapper, input));
        var claim = review.putObject("budgetClaim").put("quote", quote).put("relation", relation).put("proposedBudget", proposed);
        if (sourcePath == null) claim.putNull("sourcePath"); else claim.put("sourcePath", sourcePath);
        if (source == null) claim.putNull("sourceBudget"); else claim.put("sourceBudget", source);
        return review;
    }

    private ObjectNode context(MarketAiQuestDraft draft, Integer sourceBudget) {
        return contextWithHistory(draft, sourceBudget);
    }

    private ObjectNode contextWithHistory(MarketAiQuestDraft draft, Integer... sourceBudgets) {
        return MarketQuestConsistencyReview.context(mapper, draft, semanticPrompt(sourceBudgets), null);
    }

    private ObjectNode semanticPrompt(Integer... sourceBudgets) {
        var semanticPrompt = mapper.createObjectNode();
        semanticPrompt.putObject("aiDifficultyRecommendation").putObject("adjustments").put("budget", 6000);
        semanticPrompt.putObject("aiUserAnalysis");
        var history = semanticPrompt.putArray("practiceHistory");
        for (int i = 0; i < sourceBudgets.length; i++) {
            var play = history.addObject().put("sessionId", "literal-source-session-" + i)
                    .put("playOrder", i + 1).put("sourceAvailable", true);
            var mission = play.putObject("recordedPractice").putArray("tasks").addObject().putObject("mission")
                    .put("description", "이전 기록의 예산 설명이에요.").put("timeLimitSeconds", 6000);
            if (sourceBudgets[i] != null) mission.put("budget", sourceBudgets[i]);
            mission.set("objectives", mapper.valueToTree(List.of(Map.of("productId", "banana", "quantity", 1))));
        }
        return semanticPrompt;
    }

    private MarketAiQuestDraft draft(int budget, String description, String summary) {
        return new MarketAiQuestDraft(1, "CUSTOM", "구매 조건 관찰", description, budget,
                List.of(new MarketAiQuestDraft.Objective("banana", 1)), List.of("바나나 1송이를 골라요."),
                List.of("장보기를 마쳤다면 제출해요."), "연습을 마쳤어요.", summary, List.of("OBSERVATION_PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "원본 자리에서 선택을 관찰해요."), 420);
    }
}
