package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class QuestObservationPlanContractTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private MarketAiQuestDraft draft(String product) {
        return new MarketAiQuestDraft(2, "CUSTOM", "규격 선택", "목표 규격과 구매 수를 골라요.", 3000,
                List.of(new MarketAiQuestDraft.Objective(product, 1)), List.of("목표 상품 1개를 골라요."),
                List.of("장보기를 마쳤다면 제출해요.", "계속 장보거나 중단을 선택할 수 있어요."), "연습을 마쳤어요.",
                "구매 조건을 유지하며 선택 과정을 관찰해요.", List.of("OBSERVATION_PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "기본 자리를 유지합니다."), 300);
    }
    private ObjectNode context(String before, String after) {
        var prompt = mapper.createObjectNode();
        var play = prompt.putArray("practiceHistory").addObject().put("sessionId", "old-session").put("playOrder", 1);
        play.putObject("recordedPractice").putArray("tasks").addObject().set("mission", mapper.valueToTree(draft(before)));
        return MarketQuestConsistencyReview.context(mapper, draft(after), prompt, null);
    }
    private ObjectNode review(ObjectNode input) {
        return (ObjectNode)mapper.readTree(MarketQuestReviewFixtures.valid(mapper, new MarketAiQuestPromptFactory(mapper).consistencyReviewPrompt(input)).text());
    }
    private ObjectNode plan(ObjectNode review) { return (ObjectNode)review.path("observationPlan"); }
    @Test void a_same_product_repeat_cannot_be_claimed_as_transfer_or_completed_learning() {
        var input = context("milk", "milk"); var review = review(input);
        String before = input.toString();
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input)).containsKey("observationPlan");
        plan(review).put("purpose", "TRANSFER_PROBE");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        plan(review).put("purpose", "REPEAT_OBSERVATION").put("learningClaim", "MASTERED");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        assertThat(input.toString()).isEqualTo(before);
    }
    @Test void real_different_product_probe_retains_actual_change_and_unanswered_question_without_learning_claim() {
        var input = context("milk", "water"); var review = review(input);
        plan(review).put("purpose", "TRANSFER_PROBE").put("untestedQuestion", "다른 상품에서도 목표 규격과 구매 수를 선택하는지 관찰합니다.");
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input)).containsKey("observationPlan");
        assertThat(plan(review).path("changedDimensions")).containsExactly(mapper.valueToTree("OBJECTIVES"));
        assertThat(plan(review).path("learningClaim").asString()).isEqualTo("NOT_ESTABLISHED");
    }
    @Test void missing_baseline_difficulty_or_support_cannot_be_filled_from_labels() {
        var input = context("milk", "milk");
        var task = (ObjectNode)input.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0);
        ((ObjectNode)task.path("mission")).remove("difficulty");
        ((ObjectNode)task.path("literalComparisonToCandidate")).remove("sameDifficulty");
        input.set("observationComparisonSource", MarketQuestConsistencyReview.observationComparisonSource(mapper, input));
        var review = review(input); plan(review).putArray("changedDimensions").add("DIFFICULTY");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        plan(review).putArray("changedDimensions").add("SUPPORT");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void known_numeric_changes_must_be_reported_and_latest_source_cannot_be_swapped_for_an_older_task() {
        var input = context("milk", "milk");
        var comparison = (ObjectNode)input.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0).path("literalComparisonToCandidate");
        comparison.put("sameBudget", false).put("sameTimeLimit", false);
        input.set("observationComparisonSource", MarketQuestConsistencyReview.observationComparisonSource(mapper, input));
        var review = review(input); plan(review).putArray("changedDimensions");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        plan(review).putArray("changedDimensions").add("BUDGET").add("TIME");
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input)).containsKey("observationPlan");
        plan(review).put("comparisonSourcePath", "/practiceHistoryFacts/9/recordedTasks/0");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void hint_fading_is_allowed_only_with_same_goals_and_without_other_burden_changes() {
        var input = context("milk", "milk");
        var comparison = (ObjectNode)input.path("practiceHistoryFacts").get(0).path("recordedTasks").get(0).path("literalComparisonToCandidate");
        comparison.put("sameInstructionTextIgnoringWhitespaceAndSentenceSplits", false);
        input.set("observationComparisonSource", MarketQuestConsistencyReview.observationComparisonSource(mapper, input));
        var review = review(input); plan(review).put("purpose", "SUPPORT_FADING").putArray("changedDimensions").add("SUPPORT");
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input)).containsKey("observationPlan");
        comparison.put("sameBudget", false); input.set("observationComparisonSource", MarketQuestConsistencyReview.observationComparisonSource(mapper, input));
        plan(review).putArray("changedDimensions").add("SUPPORT").add("BUDGET");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void changed_purchase_requirements_cannot_be_a_same_condition_repeat_and_future_effects_cannot_be_established() {
        var input = context("milk", "water"); var review = review(input);
        plan(review).put("purpose", "REPEAT_OBSERVATION");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        plan(review).put("purpose", "TRANSFER_PROBE");
        var condition = (ObjectNode)review.path("conditionClaim"); condition.put("relation", "SAME").putArray("dimensions").add("OBJECTIVES");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        condition.put("relation", "CHANGED");
        var effect = (ObjectNode)review.path("effectClaim"); effect.put("movement", "EXCLUDED");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
        effect.put("movement", "INTENDED_REDUCTION");
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input)).containsKey("effectClaim");
        effect.put("learning", "ESTABLISHED");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input)).isInstanceOf(MarketQuestValidationException.class);
    }
}
