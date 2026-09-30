package oneuldo.behaviorlog.personalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import oneuldo.member.domain.Member;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "market_ai_quest_generations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MarketAiQuestGeneration {

    public record Attempt(int sequence, String rawOutput, String failureReason,
            java.util.Map<String, Object> validationDetails) {
        public Attempt(int sequence, String rawOutput, String failureReason) {
            this(sequence, rawOutput, failureReason, null);
        }
    }

    @Id
    private UUID id;
    @Column(length = 64, updatable = false)
    private String requestKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analysis_input_snapshot_id", updatable = false)
    private BehaviorAnalysisInputSnapshot analysisInputSnapshot;

    @Column(name = "analysis_id", updatable = false)
    private UUID analysisId;

    @Column(name = "profile_id", updatable = false)
    private UUID profileId;

    @Column(nullable = false, length = 20, updatable = false)
    private String source;

    @Column(length = 100, updatable = false)
    private String model;

    @Column(name = "latency_ms", nullable = false, updatable = false)
    private long latencyMs;

    @Column(name = "personalization_mode", nullable = false, length = 30, updatable = false)
    private String personalizationMode;

    @Column(name = "prompt_version", nullable = false, length = 50, updatable = false)
    private String promptVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private List<Attempt> attempts;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "validated_quest", columnDefinition = "jsonb", updatable = false)
    private MarketAiQuestDraft validatedQuest;

    @Column(name = "failure_reason", columnDefinition = "text", updatable = false)
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public MarketAiQuestGeneration(UUID id, Member member,
            BehaviorAnalysisInputSnapshot analysisInputSnapshot, UUID analysisId, UUID profileId, String source, String model,
            long latencyMs, String personalizationMode, String promptVersion,
            List<Attempt> attempts, MarketAiQuestDraft validatedQuest,
            String failureReason, Instant createdAt) {
        this.id = id;
        this.member = member;
        this.analysisInputSnapshot = analysisInputSnapshot;
        this.analysisId = analysisId;
        this.profileId = profileId;
        this.source = source;
        this.model = model;
        this.latencyMs = latencyMs;
        this.personalizationMode = personalizationMode;
        this.promptVersion = promptVersion;
        this.attempts = List.copyOf(attempts);
        this.validatedQuest = validatedQuest;
        this.failureReason = failureReason;
        this.createdAt = createdAt;
    }

    public MarketAiQuestGeneration(UUID id, Member member,
            BehaviorAnalysisInputSnapshot input, UUID analysisId, UUID profileId, String source, String model,
            long latencyMs, String mode, String promptVersion,List<Attempt> attempts,
            MarketAiQuestDraft quest,String failure,Instant createdAt,String requestKey) {
        this(id,member,input,analysisId,profileId,source,model,latencyMs,mode,promptVersion,attempts,quest,failure,createdAt);
        this.requestKey=requestKey;
    }
}
