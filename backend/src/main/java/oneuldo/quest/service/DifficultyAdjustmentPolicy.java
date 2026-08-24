package oneuldo.quest.service;

import java.time.Duration;
import java.time.Instant;

import org.springframework.stereotype.Component;

import oneuldo.quest.domain.DifficultyAdjustmentDecision;
import oneuldo.quest.domain.QuestDifficulty;

// AI가 아니라 고정된 수치 규칙으로 5단계 난이도를 한 단계씩 조정한다.
@Component
public class DifficultyAdjustmentPolicy {

    public static final String RULE_VERSION = "five-level-difficulty-v2";
    private static final int REQUIRED_SESSIONS = 3;

    public DifficultyAdjustmentResult evaluate(
            QuestDifficulty current,
            DifficultyMetrics metrics,
            boolean higherContentExists,
            boolean lowerContentExists,
            Instant lastChangedAt,
            Instant now
    ) {
        boolean immediateLower = current.lower() != null
                && metrics.consecutiveAbandonCount() >= 2;

        if (!immediateLower && metrics.sessionCount() < REQUIRED_SESSIONS) {
            return result(DifficultyAdjustmentDecision.DATA_INSUFFICIENT, current, "SESSION_COUNT_LT_3");
        }

        boolean promote = current.higher() != null
                && metrics.sessionCount() >= REQUIRED_SESSIONS
                && metrics.stepCount() >= current.getMaxSteps() * REQUIRED_SESSIONS
                && metrics.completionRate() == 1.0
                && metrics.firstAttemptAccuracy() >= 0.85
                && metrics.hintUseRate() <= 0.20
                && metrics.retryRate() <= 0.20
                && metrics.distinctQuestCount() >= 2;

        boolean lower = current.lower() != null && (
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

        if (promote && !higherContentExists) {
            return result(DifficultyAdjustmentDecision.NO_CONTENT, current, "TARGET_DIFFICULTY_CONTENT_MISSING");
        }
        if (promote) {
            return result(DifficultyAdjustmentDecision.PROMOTE, current.higher(), "PROMOTION_THRESHOLDS_MET");
        }
        if (!lowerContentExists) {
            return result(DifficultyAdjustmentDecision.NO_CONTENT, current, "TARGET_DIFFICULTY_CONTENT_MISSING");
        }
        return result(
                DifficultyAdjustmentDecision.LOWER,
                current.lower(),
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
