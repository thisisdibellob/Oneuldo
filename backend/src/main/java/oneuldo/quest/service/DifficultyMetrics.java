package oneuldo.quest.service;

// 난이도 규칙에 전달하는 숫자만 모은 값 객체다. 응답 시간은 초기 규칙에서 제외한다.
public record DifficultyMetrics(
        int sessionCount,
        int stepCount,
        double completionRate,
        double firstAttemptAccuracy,
        double hintUseRate,
        double retryRate,
        int distinctQuestCount,
        int consecutiveAbandonCount
) {
    public static DifficultyMetrics empty() {
        return new DifficultyMetrics(0, 0, 0, 0, 0, 0, 0, 0);
    }
}
