package oneuldo.behaviorlog.analysis.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "ai_behavior_analyses")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiBehaviorAnalysisRun {
    public record Attempt(int number, String inputPrompt, String rawOutput, String errorCode) {}
    @Id private UUID id;
    @Column(nullable = false, updatable = false) private UUID memberId;
    @Column(nullable = false, updatable = false) private UUID datasetId;
    @Column(nullable = false, length = 30, updatable = false) private String status;
    @Column(nullable = false, length = 50, updatable = false) private String promptVersion;
    @Column(nullable = false, length = 50, updatable = false) private String evidenceVersion;
    @Column(length = 100, updatable = false) private String model;
    @Column(nullable = false, columnDefinition = "text", updatable = false) private String systemPrompt;
    @Column(nullable = false, columnDefinition = "text", updatable = false) private String inputPrompt;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false) private List<Attempt> attempts;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", updatable = false) private AiBehaviorAnalysis result;
    @Column(length = 80, updatable = false) private String errorCode;
    @Column(nullable = false, updatable = false) private long latencyMs;
    @Column(nullable = false, updatable = false) private int eventCount;
    @Column(nullable = false, updatable = false) private Instant createdAt;

    public AiBehaviorAnalysisRun(UUID memberId, UUID datasetId, String status,
            String promptVersion, String evidenceVersion, String model,
            String systemPrompt, String inputPrompt, List<Attempt> attempts,
            AiBehaviorAnalysis result, String errorCode, long latencyMs, int eventCount) {
        this.id = UUID.randomUUID();
        this.memberId = memberId;
        this.datasetId = datasetId;
        this.status = status;
        this.promptVersion = promptVersion;
        this.evidenceVersion = evidenceVersion;
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.inputPrompt = inputPrompt;
        this.attempts = List.copyOf(attempts);
        this.result = result;
        this.errorCode = errorCode;
        this.latencyMs = latencyMs;
        this.eventCount = eventCount;
        this.createdAt = Instant.now();
    }
}
