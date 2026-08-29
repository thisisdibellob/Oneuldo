package oneuldo.behaviorlog.domain.context;

import oneuldo.behaviorlog.domain.type.InvalidReason;

public record ValidityContext(
        InvalidReason invalidReason,
        Boolean technicalError,
        Boolean assistantIntervention
) {
}
