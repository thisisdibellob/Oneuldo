package oneuldo.quest.domain;

// 서버 규칙이 내린 난이도 판단 결과다.
public enum DifficultyAdjustmentDecision {
    PROMOTE,
    MAINTAIN,
    LOWER,
    DATA_INSUFFICIENT,
    NO_CONTENT
}
