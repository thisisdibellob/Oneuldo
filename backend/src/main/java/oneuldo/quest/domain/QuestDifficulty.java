package oneuldo.quest.domain;

// 퀘스트 난이도를 나타냄
// 나중에 entity에서 @Enumerated(EnumType.STRING)로 사용될 수 있음
// v3 sql migration에서 difficulty 컬럼에 정의된 난이도만 저장할 수 있도록 제약 조건을 걸어두었음

public enum QuestDifficulty {
    VERY_EASY(2, 3, 2, 3),
    EASY(3, 4, 2, 3),
    NORMAL(4, 5, 3, 4),
    HARD(5, 6, 3, 4),
    VERY_HARD(6, 7, 4, 5);

    private final int minSteps;
    private final int maxSteps;
    private final int minChoicesPerStep;
    private final int maxChoicesPerStep;

    QuestDifficulty(
            int minSteps,
            int maxSteps,
            int minChoicesPerStep,
            int maxChoicesPerStep
    ) {
        this.minSteps = minSteps;
        this.maxSteps = maxSteps;
        this.minChoicesPerStep = minChoicesPerStep;
        this.maxChoicesPerStep = maxChoicesPerStep;
    }

    public int getMinSteps() {
        return minSteps;
    }

    public int getMaxSteps() {
        return maxSteps;
    }

    public int getMinChoicesPerStep() {
        return minChoicesPerStep;
    }

    public int getMaxChoicesPerStep() {
        return maxChoicesPerStep;
    }

    public QuestDifficulty higher() {
        int index = ordinal() + 1;
        return index < values().length ? values()[index] : null;
    }

    public QuestDifficulty lower() {
        int index = ordinal() - 1;
        return index >= 0 ? values()[index] : null;
    }
}
