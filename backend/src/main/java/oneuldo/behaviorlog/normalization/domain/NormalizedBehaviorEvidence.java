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
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "normalized_behavior_evidence")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NormalizedBehaviorEvidence {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "normalized_event_id", nullable = false, updatable = false)
    private NormalizedBehaviorEvent normalizedEvent;

    @Column(name = "skill_code", nullable = false, length = 100, updatable = false)
    private String skillCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "evidence_direction", nullable = false, length = 20, updatable = false)
    private EvidenceDirection direction;

    @Enumerated(EnumType.STRING)
    @Column(name = "evidence_role", nullable = false, length = 20, updatable = false)
    private EvidenceRole evidenceRole;

    public NormalizedBehaviorEvidence(NormalizedBehaviorEvent normalizedEvent, String skillCode,
            EvidenceDirection direction, EvidenceRole evidenceRole) {
        this.normalizedEvent = Objects.requireNonNull(normalizedEvent);
        this.skillCode = Objects.requireNonNull(skillCode);
        this.direction = Objects.requireNonNull(direction);
        this.evidenceRole = Objects.requireNonNull(evidenceRole);
    }
}
