package oneuldo.behaviorlog.analysis.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.member.domain.Member;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "behavior_analysis_input_snapshots", indexes = {
        @Index(name = "idx_behavior_analysis_input_member_generated",
                columnList = "member_id, generated_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorAnalysisInputSnapshot {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @Column(name = "schema_version", nullable = false, length = 50, updatable = false)
    private String schemaVersion;

    @Column(name = "analysis_from", nullable = false, updatable = false)
    private Instant analysisFrom;

    @Column(name = "analysis_to", nullable = false, updatable = false)
    private Instant analysisTo;

    @Column(name = "session_count", nullable = false, updatable = false)
    private int sessionCount;

    @Column(name = "event_count", nullable = false, updatable = false)
    private int eventCount;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "input_data", nullable = false, columnDefinition = "jsonb", updatable = false)
    private BehaviorAnalysisInput inputData;

    @Column(name = "generated_at", nullable = false, updatable = false)
    private Instant generatedAt;

    public BehaviorAnalysisInputSnapshot(Member member, BehaviorAnalysisInput inputData) {
        this.id = Objects.requireNonNull(inputData.datasetId());
        this.member = Objects.requireNonNull(member);
        this.schemaVersion = Objects.requireNonNull(inputData.schemaVersion());
        this.analysisFrom = inputData.analysisWindow().from();
        this.analysisTo = inputData.analysisWindow().to();
        this.sessionCount = inputData.sessionCount();
        this.eventCount = inputData.eventCount();
        this.inputData = inputData;
        this.generatedAt = inputData.generatedAt();
    }
}
