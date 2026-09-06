package oneuldo.behaviorlog.personalization.domain;

import java.util.List;
import java.util.UUID;

public record MarketAiQuestResponse(
        UUID generationId,
        UUID analysisId,
        UUID profileId,
        String source,
        String model,
        long latencyMs,
        String personalizationMode,
        String promptVersion,
        Quest quest,
        String adaptationSummary,
        List<String> reasonCodes
) {
    public record Quest(
            String id,
            String scenarioId,
            String catalogVersion,
            String scenarioVersion,
            int difficulty,
            String title,
            String description,
            int budget,
            List<MarketAiQuestDraft.Objective> objectives,
            List<String> briefing,
            List<String> checkoutDialogue,
            String successMessage
    ) {}

    public static MarketAiQuestResponse from(UUID generationId, UUID analysisId, UUID profileId, String source, String model,
            long latencyMs, String personalizationMode, String promptVersion,
            MarketAiQuestDraft draft) {
        return new MarketAiQuestResponse(
                generationId, analysisId, profileId, source, model, latencyMs, personalizationMode, promptVersion,
                new Quest(
                        "market-ai-" + generationId,
                        draft.scenarioId(),
                        oneuldo.behaviorlog.personalization.service.MarketQuestCatalog.VERSION,
                        oneuldo.behaviorlog.personalization.service.MarketQuestCatalog.SCENARIO_VERSION,
                        draft.difficulty(), draft.title(), draft.description(), draft.budget(),
                        List.copyOf(draft.objectives()), List.copyOf(draft.briefing()),
                        List.copyOf(draft.checkoutDialogue()), draft.successMessage()),
                draft.adaptationSummary(), List.copyOf(draft.reasonCodes()));
    }
}
