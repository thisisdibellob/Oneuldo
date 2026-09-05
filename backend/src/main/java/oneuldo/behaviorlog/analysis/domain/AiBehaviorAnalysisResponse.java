package oneuldo.behaviorlog.analysis.domain;

import java.time.Instant;
import java.util.UUID;

public record AiBehaviorAnalysisResponse(UUID analysisId, UUID datasetId, String status,
        String model, String promptVersion, String evidenceVersion, int eventCount,
        long latencyMs, Instant createdAt, String errorCode, AiBehaviorAnalysis analysis) {
    public static AiBehaviorAnalysisResponse from(AiBehaviorAnalysisRun run) {
        return new AiBehaviorAnalysisResponse(run.getId(), run.getDatasetId(), run.getStatus(),
                run.getModel(), run.getPromptVersion(), run.getEvidenceVersion(), run.getEventCount(),
                run.getLatencyMs(), run.getCreatedAt(), run.getErrorCode(), run.getResult());
    }
}
