package oneuldo.behaviorlog.profile.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "behavior_profile_evidence_links")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorProfileEvidenceLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false, updatable = false)
    private BehaviorProfileSnapshot profile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "normalized_event_id", nullable = false, updatable = false)
    private NormalizedBehaviorEvent normalizedEvent;

    @Column(name = "skill_code", length = 100, updatable = false)
    private String skillCode;

    @Column(nullable = false, updatable = false)
    private boolean included;

    @Column(name = "exclusion_reason", length = 100, updatable = false)
    private String exclusionReason;

    public BehaviorProfileEvidenceLink(BehaviorProfileSnapshot profile,
            NormalizedBehaviorEvent normalizedEvent, String skillCode,
            boolean included, String exclusionReason) {
        this.profile = Objects.requireNonNull(profile);
        this.normalizedEvent = Objects.requireNonNull(normalizedEvent);
        this.skillCode = skillCode;
        this.included = included;
        this.exclusionReason = exclusionReason;
    }
}
