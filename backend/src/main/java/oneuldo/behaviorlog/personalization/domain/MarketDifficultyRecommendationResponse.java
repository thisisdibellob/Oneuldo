package oneuldo.behaviorlog.personalization.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MarketDifficultyRecommendationResponse(
        UUID recommendationId,
        UUID profileSnapshotId,
        String gameId,
        int recommendedDifficulty,
        String personalizationMode,
        Adjustments adjustments,
        List<String> reasonCodes,
        String policyVersion,
        Instant generatedAt
) {
    public record Adjustments(
            int itemCount,
            String quantityComplexity,
            String budgetPressure,
            String textSupport
    ) {}

    public static MarketDifficultyRecommendationResponse from(
            MarketDifficultyRecommendation recommendation) {
        return new MarketDifficultyRecommendationResponse(
                recommendation.getId(),
                recommendation.getProfileSnapshot() == null
                        ? null : recommendation.getProfileSnapshot().getId(),
                "MARKET_SIMULATION",
                recommendation.getRecommendedDifficulty(),
                recommendation.getPersonalizationMode(),
                new Adjustments(
                        recommendation.getItemCount(),
                        recommendation.getQuantityComplexity(),
                        recommendation.getBudgetPressure(),
                        recommendation.getTextSupport()),
                recommendation.getReasonCodes(),
                recommendation.getPolicyVersion(),
                recommendation.getGeneratedAt()
        );
    }
}
