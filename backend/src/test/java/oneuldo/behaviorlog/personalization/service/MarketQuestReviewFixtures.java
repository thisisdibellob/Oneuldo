package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import java.util.Map;
import oneuldo.ai.client.GroqChatClient;
import tools.jackson.databind.ObjectMapper;

/** Mocked reviewer approval; no live provider or learner assessment. */
public final class MarketQuestReviewFixtures {
    private MarketQuestReviewFixtures() {}
    public static GroqChatClient.GroqChatResult valid(ObjectMapper mapper, String prompt) {
        var input = mapper.readTree(prompt);
        var facts = input.path("candidateFacts");
        var source = input.path("budgetComparisonSource");
        var budgetClaim = mapper.createObjectNode().put("quote", input.path("deliveredQuest").path("adaptationSummary").asString())
                .put("relation", "UNSPECIFIED").put("proposedBudget", facts.path("budget").asInt());
        budgetClaim.set("sourcePath", source.has("sourcePath") ? source.get("sourcePath").deepCopy() : mapper.nullNode());
        budgetClaim.set("sourceBudget", source.has("sourceBudget") ? source.get("sourceBudget").deepCopy() : mapper.nullNode());
        var envelope = new java.util.LinkedHashMap<String,Object>(Map.of(
                "verdict", "VALID", "objectiveQuantityTotal", facts.path("objectiveQuantityTotal").asInt(),
                "objectiveCostTotal", facts.path("objectiveCostTotal").asInt(),
                "checkedDimensions", MarketQuestConsistencyReview.DIMENSIONS,
                "adaptationPlan", Map.of("observationPurpose", "현재 목표 조건에서 규격과 구매 수를 함께 고르는 과정을 추가 관찰해요.", "deliveredChanges", List.of()),
                "budgetClaim", budgetClaim,
                "shelfClaims", List.of(),
                "observationPlan", observationPlan(mapper, input),
                "issues", List.of()));
        envelope.put("conditionClaim", conditionClaim(mapper, input));
        envelope.put("effectClaim", effectClaim(mapper, input));
        return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(envelope), "test-review");
    }
    public static tools.jackson.databind.node.ObjectNode observationPlan(ObjectMapper mapper, tools.jackson.databind.JsonNode input) {
        var source = input.path("observationComparisonSource");
        var result = mapper.createObjectNode().put("purpose", "REPEAT_OBSERVATION").put("untestedQuestion", "다음 선택에서 규격과 구매 수의 일치가 재현되는지 관찰합니다.")
                .put("learningClaim", "NOT_ESTABLISHED");
        result.set("comparisonSourcePath", source.path("sourcePath").deepCopy());
        var changes = result.putArray("changedDimensions");
        var literal = source.path("recordedTask").path("literalComparisonToCandidate");
        java.util.Map.of("OBJECTIVES", "sameObjectivesAndQuantities", "BUDGET", "sameBudget", "TIME", "sameTimeLimit", "DIFFICULTY", "sameDifficulty")
                .forEach((name, key) -> { if (literal.path(key).isBoolean() && !literal.path(key).asBoolean()) changes.add(name); });
        if (!changes.isEmpty() || !literal.path("sameObjectivesAndQuantities").asBoolean()) result.put("purpose", "GUIDED_PRACTICE");
        return result;
    }
    public static tools.jackson.databind.node.ObjectNode conditionClaim(ObjectMapper mapper, tools.jackson.databind.JsonNode input) {
        var claim = mapper.createObjectNode().put("quote", input.path("deliveredQuest").path("adaptationSummary").asString()).put("relation", "UNSPECIFIED");
        claim.putArray("dimensions"); return claim;
    }
    public static tools.jackson.databind.node.ObjectNode effectClaim(ObjectMapper mapper, tools.jackson.databind.JsonNode input) {
        return mapper.createObjectNode().put("quote", input.path("deliveredQuest").path("adaptationSummary").asString()).put("movement", "UNSPECIFIED").put("learning", "UNSPECIFIED");
    }
}
