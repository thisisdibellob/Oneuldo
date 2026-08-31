package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

public record MarketPersonalizationDecision(
        int recommendedDifficulty,
        String personalizationMode,
        int itemCount,
        String quantityComplexity,
        String budgetPressure,
        String textSupport,
        List<String> reasonCodes
) {
    public MarketPersonalizationDecision {
        reasonCodes = List.copyOf(reasonCodes);
    }
}
