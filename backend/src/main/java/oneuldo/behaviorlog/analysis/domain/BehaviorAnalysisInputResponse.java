package oneuldo.behaviorlog.analysis.domain;

import java.time.Instant;
import java.util.UUID;

public record BehaviorAnalysisInputResponse(
        UUID id,
        String schemaVersion,
        Instant generatedAt,
        int sessionCount,
        int eventCount,
        BehaviorAnalysisInput input
) {
    public static BehaviorAnalysisInputResponse from(BehaviorAnalysisInputSnapshot snapshot) {
        return new BehaviorAnalysisInputResponse(
                snapshot.getId(), snapshot.getSchemaVersion(), snapshot.getGeneratedAt(),
                snapshot.getSessionCount(), snapshot.getEventCount(), snapshot.getInputData());
    }
}
