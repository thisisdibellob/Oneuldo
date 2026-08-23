package oneuldo.ai.dto;

public record QuestGenerationResponse(
        String requestId,
        String text,
        String model,
        long latencyMs
) {
}
