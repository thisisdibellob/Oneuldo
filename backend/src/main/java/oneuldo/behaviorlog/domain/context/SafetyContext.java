package oneuldo.behaviorlog.domain.context;

import oneuldo.behaviorlog.domain.type.SafetySeverity;

public record SafetyContext(
        String safetyEventCode,
        SafetySeverity safetySeverity,
        Boolean nearMiss
) {
}
