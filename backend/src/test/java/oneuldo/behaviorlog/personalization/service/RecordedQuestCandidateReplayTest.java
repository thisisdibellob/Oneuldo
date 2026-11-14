package oneuldo.behaviorlog.personalization.service;

import java.nio.file.Files;
import java.nio.file.Path;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Replays an actual rejected candidate through the production preparation path without another model call. */
@EnabledIfSystemProperty(named = "oneuldo.quest-candidate.record", matches = ".+")
class RecordedQuestCandidateReplayTest {
    @Test
    @EnabledIfSystemProperty(named = "oneuldo.quest-support.record", matches = ".+")
    void actual_false_valid_support_review_identifies_missing_baseline_and_is_not_reinforced_in_repair() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var record = mapper.readTree(Files.readString(Path.of(System.getProperty("oneuldo.quest-support.record"))));
        String raw = record.path("providerResponses").get(1).path("response").path("text").asString();
        var review = mapper.readTree(raw);
        var input = (tools.jackson.databind.node.ObjectNode)mapper.readTree(record.path("providerResponses").get(1).path("inputPrompt").asString());
        assertThat(review.path("verdict").asString()).isEqualTo("VALID");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, failure -> {
                    assertThat(mapper.valueToTree(failure.details()).path("conditionComparison").path("unknownDimensions"))
                            .containsExactly(mapper.valueToTree("SUPPORT"));
                    var feedback = MarketAiQuestService.repairFeedbackDetails(failure.details());
                    assertThat(feedback).doesNotContainKey("reviewOutput").containsEntry("reviewOutputPreservedInAudit", true);
                    assertThat(mapper.readTree((String) failure.details().get("reviewOutput"))).isEqualTo(review);
                });
    }
    @Test void recorded_underfunded_candidate_is_rejected_with_literal_prices_and_without_rewriting() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var record = mapper.readTree(Files.readString(Path.of(System.getProperty("oneuldo.quest-candidate.record"))));
        var candidate = mapper.readTree(record.path("attempts").get(1).path("rawOutput").asString());
        var validator = new MarketAiQuestValidator();
        validator.validateGeneratedNumericJson(candidate);
        validator.validateGeneratedTextJson(candidate);
        validator.validateGeneratedShapeJson(candidate);
        var before = candidate.deepCopy();
        assertThatThrownBy(() -> validator.validateGenerated(mapper.treeToValue(candidate, MarketAiQuestDraft.class), 2))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, failure -> assertThat(failure.details())
                        .containsEntry("code", "BUDGET_OUT_OF_RANGE").containsEntry("objectiveTotal", 5800)
                        .containsEntry("submittedBudget", 5400).containsEntry("minimumBudget", 5800));
        assertThat(candidate).isEqualTo(before);
    }
}
