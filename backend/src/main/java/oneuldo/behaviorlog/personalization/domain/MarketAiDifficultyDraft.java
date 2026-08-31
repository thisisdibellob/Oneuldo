package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

public record MarketAiDifficultyDraft(
        int recommendedDifficulty,
        int itemCount,
        String quantityComplexity,
        String budgetPressure,
        String textSupport,
        List<String> reasonCodes
) {
    public MarketAiDifficultyDraft {
        reasonCodes = reasonCodes == null ? List.of() : List.copyOf(reasonCodes);
    }
}
