package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

/** Real issued v26 facts; explicit v27 claim annotations below are operator-authored test inputs. */
class MarketQuestShelfClaimContractTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    private ObjectNode fixture() throws Exception {
        return (ObjectNode) mapper.readTree(getClass().getResourceAsStream(
                "/market/quest-false-central-placement-20261010.json"));
    }

    private ObjectNode annotated(ObjectNode fixture) {
        var review = (ObjectNode) fixture.path("actualV26Review").deepCopy();
        var claim = review.putArray("shelfClaims").addObject();
        claim.put("textPath", "/deliveredQuest/adaptationSummary")
                .put("quote", fixture.path("input").path("deliveredQuest").path("adaptationSummary").asString())
                .put("categoryId", "fresh").put("claimedSlotId", "middle-center");
        var input = (ObjectNode)fixture.path("input");
        input.set("observationComparisonSource", MarketQuestConsistencyReview.observationComparisonSource(mapper, input));
        review.set("observationPlan", MarketQuestReviewFixtures.observationPlan(mapper, input));
        review.set("conditionClaim", MarketQuestReviewFixtures.conditionClaim(mapper, input));
        review.set("effectClaim", MarketQuestReviewFixtures.effectClaim(mapper, input));
        return review;
    }

    @Test void a_valid_ai_review_cannot_approve_central_fresh_prose_when_the_real_assignment_is_northwest() throws Exception {
        var fixture = fixture(); var input = (ObjectNode) fixture.path("input");
        var review = annotated(fixture); String original = fixture.toString();
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error -> {
                    assertThat(error.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_MISMATCH");
                    var actual = mapper.valueToTree(error.details().get("actualPlannedAssignment"));
                    assertThat(actual.path("categoryId").asString()).isEqualTo("fresh");
                    assertThat(actual.path("slotId").asString()).isEqualTo("northwest");
                    assertThat(mapper.valueToTree(error.details().get("issues")).get(0).path("code").asString())
                            .isEqualTo("SHELF_CLAIM_MISMATCH");
                });
        assertThat(fixture.toString()).isEqualTo(original);
        assertThat(review.path("verdict").asString()).isEqualTo("VALID");
    }

    @Test void corrected_prose_and_its_ai_selected_literal_slot_pass_without_rewriting_the_quest() throws Exception {
        var fixture = fixture(); var input = (ObjectNode) fixture.path("input");
        var review = annotated(fixture);
        String corrected = "fresh 매대를 북서쪽 첫 번째 슬롯에 배정하여 같은 품목의 조작을 추가 관찰합니다.";
        ((ObjectNode) input.path("deliveredQuest")).put("adaptationSummary", corrected);
        ((ObjectNode) review.path("budgetClaim")).put("quote", corrected);
        ((ObjectNode) review.path("conditionClaim")).put("quote", corrected);
        ((ObjectNode) review.path("effectClaim")).put("quote", corrected);
        ((ObjectNode) review.path("shelfClaims").get(0)).put("quote", corrected).put("claimedSlotId", "northwest");
        ((ObjectNode) review.path("adaptationPlan")).set("deliveredChanges", mapper.valueToTree(List.of()));
        ((ObjectNode) review.path("adaptationPlan")).put("observationPurpose", "동일한 단일 품목의 추가 조작을 관찰합니다.");
        String before = input.toString();
        assertThat(MarketQuestConsistencyReview.validate(mapper, review, input))
                .containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEWED").containsKey("shelfClaims");
        assertThat(input.toString()).isEqualTo(before);
        assertThat(input.path("candidateFacts").path("timeLimitSeconds").asInt()).isEqualTo(300);
        assertThat(input.path("candidateFacts").path("budget").asInt()).isEqualTo(3000);
    }

    @Test void the_reviewers_own_delivered_changes_must_also_match_the_actual_assignment() throws Exception {
        var fixture = fixture(); var input = (ObjectNode) fixture.path("input"); var review = annotated(fixture);
        var claims = review.putArray("shelfClaims");
        claims.addObject().put("textPath", "/adaptationPlan/deliveredChanges/4")
                .put("quote", review.path("adaptationPlan").path("deliveredChanges").get(4).asString())
                .put("categoryId", "fresh").put("claimedSlotId", "middle-center");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error ->
                        assertThat(error.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_MISMATCH"));
    }

    @Test void verbatim_position_excerpt_is_anchored_to_its_real_source_without_changing_its_claim() throws Exception {
        var fixture = fixture(); var input = (ObjectNode) fixture.path("input"); var review = annotated(fixture);
        String excerpt = "fresh 매대를 중앙에 배치해 접근성을 고려합니다.";
        assertThat(input.path("deliveredQuest").path("adaptationSummary").asString()).contains(excerpt);
        ((ObjectNode) review.path("shelfClaims").get(0)).put("quote", excerpt);
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error ->
                        assertThat(error.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_MISMATCH"));
        ((ObjectNode) review.path("shelfClaims").get(0)).put("quote", "fresh 매대를 남쪽에 배치합니다.");
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error ->
                        assertThat(error.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID")
                                .containsEntry("path", "/shelfClaims/0/quote"));
    }

    @Test void an_unknown_quote_path_or_missing_claim_contract_is_rejected_instead_of_auto_filled() throws Exception {
        var fixture = fixture(); var input = (ObjectNode) fixture.path("input");
        var missing = (ObjectNode) fixture.path("actualV26Review").deepCopy();
        assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, missing, input))
                .isInstanceOf(MarketQuestValidationException.class);
        for (String path : List.of("/invented/slot", "/candidateFacts/plannedSlotAssignments/0/slotId")) {
            var review = annotated(fixture);
            ((ObjectNode) review.path("shelfClaims").get(0)).put("textPath", path);
            assertThatThrownBy(() -> MarketQuestConsistencyReview.validate(mapper, review, input))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, error ->
                            assertThat(error.details()).containsEntry("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID"));
        }
        assertThat(missing.has("shelfClaims")).isFalse();
    }
}
