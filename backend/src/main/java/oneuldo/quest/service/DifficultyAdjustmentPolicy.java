package oneuldo.quest.service;

import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Component;

import oneuldo.quest.domain.DifficultyAdjustmentDecision;
import oneuldo.quest.domain.QuestDifficulty;

// AI가 아니라 고정된 수치 규칙으로 EASY와 NORMAL 사이를 한 단계씩 조정한다.
@Component
public class DifficultyAdjustmentPolicy {

    public static final String RULE_VERSION = "phase5-difficulty-v1";
    private static final int REQUIRED_SESSIONS = 3;
    private static final int REQUIRED_PROMOTION_STEPS = 12;

    public DifficultyAdjustmentResult evaluate(
            QuestDifficulty current,
            DifficultyMetrics metrics,
            boolean targetContentExists,
            Instant lastChangedAt,
            Instant now
    ) {
        boolean immediateLower = current == QuestDifficulty.NORMAL
                && metrics.consecutiveAbandonCount() >= 2;

        if (!immediateLower && metrics.sessionCount() < REQUIRED_SESSIONS) {
            return result(DifficultyAdjustmentDecision.DATA_INSUFFICIENT, current, "SESSION_COUNT_LT_3");
        }

        boolean promote = current == QuestDifficulty.EASY
                && metrics.sessionCount() >= REQUIRED_SESSIONS
                && metrics.stepCount() >= REQUIRED_PROMOTION_STEPS
                && metrics.completionRate() == 1.0
                && metrics.firstAttemptAccuracy() >= 0.85
                && metrics.hintUseRate() <= 0.20
                && metrics.retryRate() <= 0.20
                && metrics.distinctQuestCount() >= 2;

        boolean lower = current == QuestDifficulty.NORMAL && (
                immediateLower
                        || metrics.completionRate() < 0.60
                        || metrics.firstAttemptAccuracy() < 0.50
                        || (metrics.hintUseRate() >= 0.70 && metrics.retryRate() >= 0.50)
        );

        if (!promote && !lower) {
            return result(DifficultyAdjustmentDecision.MAINTAIN, current, "THRESHOLD_NOT_MET");
        }

        if (lastChangedAt != null && Duration.between(lastChangedAt, now).toHours() < 24) {
            return result(DifficultyAdjustmentDecision.MAINTAIN, current, "CHANGE_COOLDOWN_24H");
        }

        if (!targetContentExists) {
            return result(DifficultyAdjustmentDecision.NO_CONTENT, current, "TARGET_DIFFICULTY_CONTENT_MISSING");
        }

        if (promote) {
            return result(DifficultyAdjustmentDecision.PROMOTE, QuestDifficulty.NORMAL, "PROMOTION_THRESHOLDS_MET");
        }
        return result(
                DifficultyAdjustmentDecision.LOWER,
                QuestDifficulty.EASY,
                immediateLower ? "TWO_CONSECUTIVE_ABANDONS" : "LOWER_THRESHOLDS_MET"
        );
    }

    private DifficultyAdjustmentResult result(
            DifficultyAdjustmentDecision decision,
            QuestDifficulty difficulty,
            String reasonCodes
    ) {
        return new DifficultyAdjustmentResult(decision, difficulty, reasonCodes);
    }
}
