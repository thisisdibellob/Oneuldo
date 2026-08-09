package oneuldo.quest.domain;

// 퀘스트 난이도를 나타냄
// 나중에 entity에서 @Enumerated(EnumType.STRING)로 사용될 수 있음
// v3 sql migration에서 difficulty 컬럼에 정의된 난이도만 저장할 수 있도록 제약 조건을 걸어두었음

public enum QuestDifficulty {
    VERY_EASY,
    EASY,
    NORMAL,
    HARD,
    VERY_HARD
}
