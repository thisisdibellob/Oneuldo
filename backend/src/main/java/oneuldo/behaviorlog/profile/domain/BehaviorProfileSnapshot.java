package oneuldo.behaviorlog.profile.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
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
@Table(name = "behavior_profile_snapshots", indexes = {
        @Index(name = "idx_behavior_profile_member_generated",
                columnList = "member_id, generated_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorProfileSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @Column(name = "profile_version", nullable = false, length = 50, updatable = false)
    private String profileVersion;

    @Column(name = "profile_policy_version", nullable = false, length = 50, updatable = false)
    private String profilePolicyVersion;

    @Column(name = "normalizer_version", nullable = false, length = 50, updatable = false)
    private String normalizerVersion;

    @Column(name = "registry_version", nullable = false, length = 50, updatable = false)
    private String registryVersion;

    @Column(name = "measurement_rule_version", nullable = false, length = 50, updatable = false)
    private String measurementRuleVersion;

    @Column(name = "evidence_from", nullable = false, updatable = false)
    private Instant evidenceFrom;

    @Column(name = "evidence_to", nullable = false, updatable = false)
    private Instant evidenceTo;

    @Column(name = "input_event_count", nullable = false, updatable = false)
    private int inputEventCount;

    @Column(name = "source_session_id", updatable = false)
    private UUID sourceSessionId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "profile_data", nullable = false, columnDefinition = "jsonb", updatable = false)
    private BehaviorProfileData profileData;

    @Column(name = "generated_at", nullable = false, updatable = false)
    private Instant generatedAt;

    public BehaviorProfileSnapshot(Member member, BehaviorProfileData profileData,
            int inputEventCount) {
        this(member, profileData, inputEventCount, null);
    }

    public BehaviorProfileSnapshot(Member member, BehaviorProfileData profileData,
            int inputEventCount, UUID sourceSessionId) {
        this.member = Objects.requireNonNull(member);
        this.profileData = Objects.requireNonNull(profileData);
        this.profileVersion = profileData.profileVersion();
        this.profilePolicyVersion = profileData.profilePolicyVersion();
        this.normalizerVersion = profileData.normalizerVersion();
        this.registryVersion = profileData.registryVersion();
        this.measurementRuleVersion = profileData.measurementRuleVersion();
        this.evidenceFrom = profileData.evidenceFrom();
        this.evidenceTo = profileData.evidenceTo();
        this.inputEventCount = inputEventCount;
        this.sourceSessionId = sourceSessionId;
        this.generatedAt = profileData.generatedAt();
    }
}
