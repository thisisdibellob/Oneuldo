package oneuldo.behaviorlog.domain;

import java.util.List;
import java.util.UUID;

public record BehaviorLogBatchResponse(
        UUID batchId,
        List<BehaviorLogResponse> events
) {

    public BehaviorLogBatchResponse {
        events = List.copyOf(events);
    }
}
