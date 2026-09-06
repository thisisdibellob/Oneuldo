package oneuldo.behaviorlog.profile.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Immutable, versioned user profile. Failed updates never replace the latest READY profile. */
@Entity
@Immutable
@Table(name = "ai_user_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiUserProfile {
    @Id private UUID id;
    @Column(nullable = false, updatable = false) private UUID memberId;
    @Column(nullable = false, updatable = false) private long profileVersion;
    @Column(updatable = false) private UUID previousProfileId;
    @Column(nullable = false, updatable = false) private UUID sourceAnalysisId;
    @Column(nullable = false, updatable = false) private UUID sourceDatasetId;
    @Column(nullable = false, updatable = false) private UUID sourceSessionId;
    @Column(nullable = false, length = 20, updatable = false) private String status;
    @Column(nullable = false, length = 50, updatable = false) private String promptVersion;
    @Column(length = 100, updatable = false) private String model;
    @Column(nullable = false, columnDefinition = "text", updatable = false) private String systemPrompt;
    @Column(nullable = false, columnDefinition = "text", updatable = false) private String inputPrompt;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private List<AiBehaviorAnalysisRun.Attempt> attempts;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", updatable = false) private AiBehaviorAnalysis profile;
    @Column(length = 80, updatable = false) private String errorCode;
    @Column(nullable = false, updatable = false) private long latencyMs;
    @Column(nullable = false, updatable = false) private Instant createdAt;

    public AiUserProfile(UUID memberId, long profileVersion, UUID previousProfileId,
            UUID sourceAnalysisId, UUID sourceDatasetId, UUID sourceSessionId,
            String status, String promptVersion, String model, String systemPrompt,
            String inputPrompt, List<AiBehaviorAnalysisRun.Attempt> attempts,
            AiBehaviorAnalysis profile, String errorCode, long latencyMs) {
        this.id = UUID.randomUUID();
        this.memberId = memberId;
        this.profileVersion = profileVersion;
        this.previousProfileId = previousProfileId;
        this.sourceAnalysisId = sourceAnalysisId;
        this.sourceDatasetId = sourceDatasetId;
        this.sourceSessionId = sourceSessionId;
        this.status = status;
        this.promptVersion = promptVersion;
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.inputPrompt = inputPrompt;
        this.attempts = List.copyOf(attempts);
        this.profile = profile;
        this.errorCode = errorCode;
        this.latencyMs = latencyMs;
        this.createdAt = Instant.now();
    }
}
