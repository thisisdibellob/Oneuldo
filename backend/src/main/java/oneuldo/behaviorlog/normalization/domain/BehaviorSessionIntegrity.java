package oneuldo.behaviorlog.normalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.member.domain.Member;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "behavior_session_integrity",
        uniqueConstraints = @UniqueConstraint(name = "uq_session_integrity_member_session",
                columnNames = {"member_id", "session_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorSessionIntegrity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "highest_event_sequence", nullable = false)
    private long highestEventSequence;

    @Column(name = "received_event_count", nullable = false)
    private long receivedEventCount;

    @Column(name = "missing_event_count", nullable = false)
    private long missingEventCount;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "missing_event_sequences", nullable = false, columnDefinition = "jsonb")
    private List<Long> missingEventSequences;

    @Column(nullable = false)
    private boolean finalized;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SessionIntegrityStatus status;

    @Column(name = "evaluated_at", nullable = false)
    private Instant evaluatedAt;

    public BehaviorSessionIntegrity(Member member, UUID sessionId) {
        this.member = Objects.requireNonNull(member);
        this.sessionId = Objects.requireNonNull(sessionId);
        reconcile(0, 0, List.of(), false, Instant.now());
    }

    public void reconcile(long highestEventSequence, long receivedEventCount,
            List<Long> missingEventSequences, boolean finalized, Instant evaluatedAt) {
        this.highestEventSequence = highestEventSequence;
        this.receivedEventCount = receivedEventCount;
        this.missingEventCount = Math.max(0, highestEventSequence - receivedEventCount);
        this.missingEventSequences = List.copyOf(missingEventSequences);
        this.finalized = finalized;
        this.status = this.missingEventCount > 0
                ? finalized ? SessionIntegrityStatus.GAPPED : SessionIntegrityStatus.OPEN_WITH_GAPS
                : finalized ? SessionIntegrityStatus.COMPLETE : SessionIntegrityStatus.OPEN;
        this.evaluatedAt = Objects.requireNonNull(evaluatedAt);
    }
}
