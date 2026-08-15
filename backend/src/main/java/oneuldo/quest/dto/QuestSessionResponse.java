package oneuldo.quest.dto;

import java.time.Instant;
import java.util.UUID;

import oneuldo.quest.domain.QuestSession;

public record QuestSessionResponse(
        UUID id,
        UUID questId,
        String status,
        String questDifficulty,
        int totalSteps,
        int completedSteps,
        int rewardPoints,
        Instant startedAt,
        Instant completedAt,
        Instant abandonedAt,
        String abandonReason
) {

    public static QuestSessionResponse from(QuestSession session) {
        return new QuestSessionResponse(
                session.getId(),
                session.getQuest().getId(),
                session.getStatus().name(),
                session.getQuestDifficulty().name(),
                session.getTotalSteps(),
                session.getCompletedSteps(),
                session.getRewardPoints(),
                session.getStartedAt(),
                session.getCompletedAt(),
                session.getAbandonedAt(),
                session.getAbandonReason()
        );
    }
}
