package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

public record MarketAiQuestDraft(
        int difficulty,
        String title,
        String description,
        int budget,
        List<Objective> objectives,
        List<String> briefing,
        List<String> checkoutDialogue,
        String successMessage,
        String adaptationSummary,
        List<String> reasonCodes
) {
    public record Objective(String productId, int quantity) {}
}
