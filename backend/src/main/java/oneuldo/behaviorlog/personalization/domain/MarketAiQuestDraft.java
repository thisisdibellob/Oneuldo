package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

public record MarketAiQuestDraft(
        int difficulty,
        String scenarioId,
        String title,
        String description,
        int budget,
        List<Objective> objectives,
        List<String> briefing,
        List<String> checkoutDialogue,
        String successMessage,
        String adaptationSummary,
        List<String> reasonCodes,
        EnvironmentPlan environmentPlan,
        Integer timeLimitSeconds,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) MarketRuntimePlan runtimePlan,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) MarketObservationPlan observationPlan
) {
    public record Objective(String productId, int quantity) {}

    public record EnvironmentPlan(List<String> shelfOrder, String rationale) {}

    public MarketAiQuestDraft(int difficulty, String scenarioId, String title, String description, int budget,
            List<Objective> objectives, List<String> briefing, List<String> checkoutDialogue, String successMessage,
            String adaptationSummary, List<String> reasonCodes, EnvironmentPlan environmentPlan, Integer timeLimitSeconds) {
        this(difficulty, scenarioId, title, description, budget, objectives, briefing, checkoutDialogue,
                successMessage, adaptationSummary, reasonCodes, environmentPlan, timeLimitSeconds, null, null);
    }

    /** Existing persisted drafts predate AI shelf placement. */
    public MarketAiQuestDraft(int difficulty, String scenarioId, String title, String description,
            int budget, List<Objective> objectives, List<String> briefing, List<String> checkoutDialogue,
            String successMessage, String adaptationSummary, List<String> reasonCodes) {
        this(difficulty, scenarioId, title, description, budget, objectives, briefing, checkoutDialogue,
                successMessage, adaptationSummary, reasonCodes, null, null);
    }

    /** Old persisted drafts retain their missing time value until legacy response conversion. */
    public MarketAiQuestDraft(int difficulty, String scenarioId, String title, String description,
            int budget, List<Objective> objectives, List<String> briefing, List<String> checkoutDialogue,
            String successMessage, String adaptationSummary, List<String> reasonCodes, EnvironmentPlan environmentPlan) {
        this(difficulty, scenarioId, title, description, budget, objectives, briefing, checkoutDialogue,
                successMessage, adaptationSummary, reasonCodes, environmentPlan, null);
    }
}
