package oneuldo.quest.dto;

import java.util.UUID;

import oneuldo.quest.domain.Quest;

// 앱의 퀘스트 목록에 전달할 응답 데이터
public record QuestSummaryResponse(
        UUID id,
        String categoryCode,
        String categoryName,
        String title,
        String summary,
        String difficulty,
        int rewardPoints
) {

    // Quest Entity를 응답 DTO로 변환함
    public static QuestSummaryResponse from(Quest quest) {
        return new QuestSummaryResponse(
                quest.getId(),
                quest.getSubcategory().getCode(),
                quest.getSubcategory().getName(),
                quest.getTitle(),
                quest.getSummary(),
                quest.getDifficulty().name(),
                quest.getRewardPoints()
        );
    }
}