package oneuldo.behaviorlog.analysis.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "behavior_analysis_input_event_links",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_behavior_analysis_input_event",
                columnNames = {"snapshot_id", "behavior_log_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorAnalysisInputEventLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "snapshot_id", nullable = false, updatable = false)
    private BehaviorAnalysisInputSnapshot snapshot;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "behavior_log_id", nullable = false, updatable = false)
    private BehaviorLog behaviorLog;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "normalized_event_id", updatable = false)
    private NormalizedBehaviorEvent normalizedEvent;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "event_sequence", nullable = false, updatable = false)
    private long eventSequence;

    public BehaviorAnalysisInputEventLink(
            BehaviorAnalysisInputSnapshot snapshot,
            BehaviorLog behaviorLog,
            NormalizedBehaviorEvent normalizedEvent
    ) {
        this.snapshot = Objects.requireNonNull(snapshot);
        this.behaviorLog = Objects.requireNonNull(behaviorLog);
        this.normalizedEvent = normalizedEvent;
        this.sessionId = behaviorLog.getSessionId();
        this.eventSequence = behaviorLog.getEventSequence();
    }
}
