package oneuldo.behaviorlog.profile.domain;

import java.time.Instant;

public record BehaviorProfileGenerateRequest(
        Instant evidenceFrom,
        Instant evidenceTo
) {
}
