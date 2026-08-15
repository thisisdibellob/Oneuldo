package oneuldo.quest.dto;

public record QuestEventResponse(
        long eventId,
        int attemptNumber,
        boolean correct,
        String feedback,
        int completedSteps,
        int totalSteps
) {
}
