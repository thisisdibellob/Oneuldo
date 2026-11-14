package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

/** Model-authored, source-linked hypotheses and the purpose of the next real observation. */
public record MarketObservationPlan(String purpose, String behaviorObservation, String movementObservation,
        List<String> behaviorEvidenceIds, List<String> movementEvidenceIds,
        List<String> alternativeExplanations, List<String> unknowns,
        List<ChangeReason> changeReasons, String evaluationFocus) {
    public record ChangeReason(String path, String reason) {}
}
