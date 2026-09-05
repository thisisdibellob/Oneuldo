package oneuldo.behaviorlog.analysis.domain;

import java.util.List;
import java.util.UUID;

/** 모든 해석과 연습 목표는 모델 출력이다. 서버는 점수나 성공률을 계산하지 않는다. */
public record AiBehaviorAnalysis(
        String summary,
        List<Finding> findings,
        List<SessionAssessment> sessionAssessments,
        List<String> uncertainties,
        PracticePlan practicePlan,
        List<String> usedEvidenceCardIds
) {
    public AiBehaviorAnalysis(String summary, List<Finding> findings, List<SessionAssessment> sessionAssessments,
            List<String> uncertainties, PracticePlan practicePlan) {
        this(summary, findings, sessionAssessments, uncertainties, practicePlan, List.of());
    }
    public record Finding(String id, String skill, String observation, String interpretation,
            List<String> alternativeExplanations, List<UUID> evidenceEventIds,
            String suggestedSupport) {}

    public record SessionAssessment(UUID sessionId, String judgment, String explanation,
            List<UUID> evidenceEventIds) {}

    public record PracticePlan(List<String> targetFindingIds, String goal, String rationale,
            int recommendedDifficulty, int itemCount, String quantityComplexity,
            String budgetPressure, String textSupport, List<String> reasonCodes) {}
}
