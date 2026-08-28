package oneuldo.behaviorlog.normalization.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.NormalizationIssue;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;

public record QuarantinedNormalizationData(
        UUID normalizedEventId,
        UUID behaviorLogId,
        String eventCode,
        ValidityStatus validityStatus,
        List<NormalizationIssue> issues,
        Instant normalizedAt
) {
}
