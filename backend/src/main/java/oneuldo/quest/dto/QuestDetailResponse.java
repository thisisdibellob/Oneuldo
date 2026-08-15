package oneuldo.quest.dto;

import java.util.List;
import java.util.UUID;

import oneuldo.quest.domain.Quest;

// 단계와 선택지를 포함한 퀘스트 상세 응답
public record QuestDetailResponse(
        UUID id,
        String code,
        String categoryCode,
        String categoryName,
        String title,
        String summary,
        String goal,
        String difficulty,
        int rewardPoints,
        List<QuestStepResponse> steps
) {

    // 퀘스트 기본 정보와 단계 응답을 결합한다.
    public static QuestDetailResponse from(
            Quest quest,
            List<QuestStepResponse> steps
    ) {
        return new QuestDetailResponse(
                quest.getId(),
                quest.getCode(),
                quest.getSubcategory().getCode(),
                quest.getSubcategory().getName(),
                quest.getTitle(),
                quest.getSummary(),
                quest.getGoal(),
                quest.getDifficulty().name(),
                quest.getRewardPoints(),
                List.copyOf(steps)
        );
    }
}
