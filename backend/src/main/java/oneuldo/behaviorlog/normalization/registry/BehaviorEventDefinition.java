package oneuldo.behaviorlog.normalization.registry;

import java.util.List;
import java.util.Set;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.domain.CanonicalActionType;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;

public record BehaviorEventDefinition(
        String eventCode,
        BehaviorPayloadType requiredPayloadType,
        BehaviorDomain domain,
        CanonicalActionType actionType,
        ObservedOutcome defaultOutcome,
        ErrorType defaultErrorType,
        boolean safetyRelevant,
        Set<String> requiredPayloadFields,
        List<SkillEvidenceRule> evidenceRules,
        List<MeasurementRule> measurementRules
) {
    public BehaviorEventDefinition {
        requiredPayloadFields = Set.copyOf(requiredPayloadFields);
        evidenceRules = List.copyOf(evidenceRules);
        measurementRules = List.copyOf(measurementRules);
    }
}
