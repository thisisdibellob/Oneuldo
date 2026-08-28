package oneuldo.behaviorlog.normalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.Objects;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "normalized_behavior_events",
        uniqueConstraints = @UniqueConstraint(name = "uq_normalized_event_log_version",
                columnNames = {"behavior_log_id", "normalizer_version"}),
        indexes = {
                @Index(name = "idx_normalized_events_domain_action", columnList = "domain, action_type"),
                @Index(name = "idx_normalized_events_status_time", columnList = "normalization_status, occurred_at")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NormalizedBehaviorEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "behavior_log_id", nullable = false, updatable = false)
    private BehaviorLog behaviorLog;

    @Column(name = "normalizer_version", nullable = false, length = 50, updatable = false)
    private String normalizerVersion;

    @Column(name = "registry_version", nullable = false, length = 50, updatable = false)
    private String registryVersion;

    @Column(name = "measurement_rule_version", nullable = false, length = 50, updatable = false)
    private String measurementRuleVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_integrity_id", updatable = false)
    private BehaviorSessionIntegrity sessionIntegrity;

    @Enumerated(EnumType.STRING)
    @Column(name = "normalization_status", nullable = false, length = 20, updatable = false)
    private NormalizationStatus normalizationStatus;

    @Enumerated(EnumType.STRING)
    @Column(length = 30, updatable = false)
    private BehaviorDomain domain;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", length = 30, updatable = false)
    private CanonicalActionType actionType;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, updatable = false)
    private ObservedOutcome outcome;

    @Enumerated(EnumType.STRING)
    @Column(name = "error_type", length = 30, updatable = false)
    private ErrorType errorType;

    @Enumerated(EnumType.STRING)
    @Column(name = "independence_level", length = 30, updatable = false)
    private IndependenceLevel independenceLevel;

    @Enumerated(EnumType.STRING)
    @Column(name = "evidence_use", nullable = false, length = 30, updatable = false)
    private EvidenceUse evidenceUse;

    @Enumerated(EnumType.STRING)
    @Column(name = "validity_status", nullable = false, length = 40, updatable = false)
    private ValidityStatus validityStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "safety_status", length = 20, updatable = false)
    private SafetyStatus safetyStatus;

    @Column(name = "source_event_code", nullable = false, length = 100, updatable = false)
    private String sourceEventCode;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "normalized_at", nullable = false, updatable = false)
    private Instant normalizedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private Set<NormalizationFlag> flags;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "normalization_issues", nullable = false, columnDefinition = "jsonb", updatable = false)
    private List<NormalizationIssue> normalizationIssues;

    public NormalizedBehaviorEvent(BehaviorLog behaviorLog, String normalizerVersion,
            String registryVersion, String measurementRuleVersion,
            BehaviorSessionIntegrity sessionIntegrity,
            NormalizationStatus normalizationStatus, BehaviorDomain domain,
            CanonicalActionType actionType, ObservedOutcome outcome, ErrorType errorType,
            IndependenceLevel independenceLevel, EvidenceUse evidenceUse,
            ValidityStatus validityStatus, SafetyStatus safetyStatus, Set<NormalizationFlag> flags,
            List<NormalizationIssue> normalizationIssues,
            Instant normalizedAt) {
        this.behaviorLog = Objects.requireNonNull(behaviorLog);
        this.normalizerVersion = Objects.requireNonNull(normalizerVersion);
        this.registryVersion = Objects.requireNonNull(registryVersion);
        this.measurementRuleVersion = Objects.requireNonNull(measurementRuleVersion);
        this.sessionIntegrity = sessionIntegrity;
        this.normalizationStatus = Objects.requireNonNull(normalizationStatus);
        this.domain = domain;
        this.actionType = actionType;
        this.outcome = outcome;
        this.errorType = errorType;
        this.independenceLevel = independenceLevel;
        this.evidenceUse = Objects.requireNonNull(evidenceUse);
        this.validityStatus = Objects.requireNonNull(validityStatus);
        this.safetyStatus = safetyStatus;
        this.sourceEventCode = behaviorLog.getEventCode();
        this.occurredAt = behaviorLog.getOccurredAt();
        this.normalizedAt = Objects.requireNonNull(normalizedAt);
        this.flags = Set.copyOf(flags);
        this.normalizationIssues = List.copyOf(normalizationIssues);
    }
}
