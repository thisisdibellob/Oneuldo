package oneuldo.quest.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class QuestDifficultyTest {

    @Test
    void 난이도가_높아질수록_단계와_선택지_범위가_확장된다() {
        assertRange(QuestDifficulty.VERY_EASY, 2, 3, 2, 3);
        assertRange(QuestDifficulty.EASY, 3, 4, 2, 3);
        assertRange(QuestDifficulty.NORMAL, 4, 5, 3, 4);
        assertRange(QuestDifficulty.HARD, 5, 6, 3, 4);
        assertRange(QuestDifficulty.VERY_HARD, 6, 7, 4, 5);
    }

    @Test
    void 난이도는_인접한_단계로만_이동한다() {
        assertNull(QuestDifficulty.VERY_EASY.lower());
        assertEquals(QuestDifficulty.EASY, QuestDifficulty.VERY_EASY.higher());
        assertEquals(QuestDifficulty.HARD, QuestDifficulty.VERY_HARD.lower());
        assertNull(QuestDifficulty.VERY_HARD.higher());
    }

    private void assertRange(
            QuestDifficulty difficulty,
            int minSteps,
            int maxSteps,
            int minChoices,
            int maxChoices
    ) {
        assertEquals(minSteps, difficulty.getMinSteps());
        assertEquals(maxSteps, difficulty.getMaxSteps());
        assertEquals(minChoices, difficulty.getMinChoicesPerStep());
        assertEquals(maxChoices, difficulty.getMaxChoicesPerStep());
    }
}
