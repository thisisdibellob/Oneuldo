package oneuldo.behaviorlog.personalization.service;

import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class RejectedReviewRepairIsolationTest {
    @Test void malformed_reviewer_text_is_preserved_only_in_the_audit_not_the_next_candidate_prompt() {
        var details = Map.<String,Object>of("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID",
                "reviewOutput", "{\"deliveredQuest\":\"invented central shelf and old candidate\"}",
                "candidateFacts", Map.of("objectiveQuantityTotal", 2), "path", "/shelfClaims/0");
        var feedback = MarketAiQuestService.repairFeedbackDetails(details);
        assertThat(feedback).doesNotContainKey("reviewOutput").containsEntry("reviewOutputPreservedInAudit", true)
                .containsEntry("candidateFacts", details.get("candidateFacts")).containsEntry("path", "/shelfClaims/0");
        assertThat(details.get("reviewOutput")).isEqualTo("{\"deliveredQuest\":\"invented central shelf and old candidate\"}");
    }
}
