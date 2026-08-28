package oneuldo.behaviorlog.domain;

import java.time.Instant;
import java.util.UUID;

public record BehaviorLogResponse(
        UUID id,
        UUID clientEventId,
        long eventSequence,
        BehaviorLogIngestStatus status,
        Instant receivedAt
) {
}
