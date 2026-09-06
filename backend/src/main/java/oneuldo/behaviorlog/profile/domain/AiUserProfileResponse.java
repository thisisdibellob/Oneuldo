package oneuldo.behaviorlog.profile.domain;

import java.time.Instant;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;

public record AiUserProfileResponse(
        UUID profileId, long profileVersion, UUID previousProfileId,
        UUID sourceAnalysisId, UUID sourceDatasetId, UUID sourceSessionId,
        String status, String model, String promptVersion, long latencyMs,
        Instant createdAt, String errorCode, AiBehaviorAnalysis profile
) {
    public static AiUserProfileResponse from(AiUserProfile value) {
        return new AiUserProfileResponse(value.getId(), value.getProfileVersion(), value.getPreviousProfileId(),
                value.getSourceAnalysisId(), value.getSourceDatasetId(), value.getSourceSessionId(),
                value.getStatus(), value.getModel(), value.getPromptVersion(), value.getLatencyMs(),
                value.getCreatedAt(), value.getErrorCode(), value.getProfile());
    }

    public AiBehaviorAnalysisResponse asAnalysisResponse() {
        return new AiBehaviorAnalysisResponse(sourceAnalysisId, sourceDatasetId, status, model,
                promptVersion, oneuldo.behaviorlog.analysis.service.EvidenceIndex.VERSION,
                0, latencyMs, createdAt, errorCode, profile);
    }
}
