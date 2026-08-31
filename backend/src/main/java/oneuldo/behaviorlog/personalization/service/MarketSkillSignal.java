package oneuldo.behaviorlog.personalization.service;

import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;

public record MarketSkillSignal(
        Double independentSuccessRate,
        int independentEvidenceCount,
        int distinctSessionCount,
        ConfidenceLevel confidence
) {
    public boolean usable() {
        return independentSuccessRate != null
                && independentEvidenceCount >= 5
                && distinctSessionCount >= 2
                && (confidence == ConfidenceLevel.MEDIUM || confidence == ConfidenceLevel.HIGH);
    }
}
