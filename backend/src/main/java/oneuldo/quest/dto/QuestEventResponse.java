package oneuldo.quest.dto;

public record QuestEventResponse(
        long eventId,
        int attemptNumber,
        Boolean correct,
        String feedback,
        int completedSteps,
        int totalSteps
) {
}
