package oneuldo.quest.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import oneuldo.quest.domain.DifficultyAdjustmentDecision;
import oneuldo.quest.domain.QuestDifficulty;

class DifficultyAdjustmentPolicyTest {

    private final DifficultyAdjustmentPolicy policy = new DifficultyAdjustmentPolicy();
    private final Instant now = Instant.parse("2026-08-18T09:00:00Z");

    @Test
    void 쉬움에서_충분히_안정적으로_성공하면_보통으로_올린다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 12, 1.0, 0.92, 0.08, 0.08, 2, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.EASY, metrics, true, true, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.PROMOTE, result.decision());
        assertEquals(QuestDifficulty.NORMAL, result.nextDifficulty());
    }

    @Test
    void 매우_쉬운_두세_단계_퀘스트_세개를_완료하면_쉬움으로_올린다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 7, 1.0, 1.0, 0, 0, 3, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.VERY_EASY, metrics, true, false, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.PROMOTE, result.decision());
        assertEquals(QuestDifficulty.EASY, result.nextDifficulty());
    }

    @Test
    void 서로_다른_퀘스트를_두_개_이상_풀지_않으면_승급하지_않는다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 12, 1.0, 1.0, 0, 0, 1, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.EASY, metrics, true, true, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.MAINTAIN, result.decision());
        assertEquals(QuestDifficulty.EASY, result.nextDifficulty());
    }

    @Test
    void 보통에서_두_번_연속_중단하면_쉬움으로_내린다() {
        DifficultyMetrics metrics = new DifficultyMetrics(2, 2, 0, 0, 0, 0, 1, 2);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.NORMAL, metrics, true, true, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.LOWER, result.decision());
        assertEquals(QuestDifficulty.EASY, result.nextDifficulty());
    }

    @Test
    void 목표_난이도_콘텐츠가_없으면_현재_난이도를_유지한다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 12, 1.0, 1.0, 0, 0, 2, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.EASY, metrics, false, true, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.NO_CONTENT, result.decision());
        assertEquals(QuestDifficulty.EASY, result.nextDifficulty());
    }

    @Test
    void 변경한_지_24시간이_지나지_않으면_다시_바꾸지_않는다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 12, 1.0, 1.0, 0, 0, 2, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.EASY, metrics, true, true, now.minusSeconds(60 * 60), now
        );

        assertEquals(DifficultyAdjustmentDecision.MAINTAIN, result.decision());
        assertEquals("CHANGE_COOLDOWN_24H", result.reasonCodes());
    }

    @Test
    void 어려움에서_승급하면_매우_어려움으로_한_단계만_올린다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 18, 1.0, 0.90, 0.10, 0.10, 2, 0);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.HARD, metrics, true, true, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.PROMOTE, result.decision());
        assertEquals(QuestDifficulty.VERY_HARD, result.nextDifficulty());
    }

    @Test
    void 매우_쉬움은_더_낮출_수_없다() {
        DifficultyMetrics metrics = new DifficultyMetrics(3, 9, 0, 0, 1.0, 1.0, 1, 3);

        DifficultyAdjustmentResult result = policy.evaluate(
                QuestDifficulty.VERY_EASY, metrics, true, false, null, now
        );

        assertEquals(DifficultyAdjustmentDecision.MAINTAIN, result.decision());
        assertEquals(QuestDifficulty.VERY_EASY, result.nextDifficulty());
    }
}
