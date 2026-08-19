package oneuldo.quest.service;

import oneuldo.quest.domain.DifficultyAdjustmentDecision;
import oneuldo.quest.domain.QuestDifficulty;

// 규칙 엔진 결과와 사람이 추적할 수 있는 사유 코드를 함께 전달한다.
public record DifficultyAdjustmentResult(
        DifficultyAdjustmentDecision decision,
        QuestDifficulty nextDifficulty,
        String reasonCodes
) {
}
