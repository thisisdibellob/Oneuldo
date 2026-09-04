package oneuldo.behaviorlog.personalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
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
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "market_difficulty_recommendations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MarketDifficultyRecommendation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analysis_input_snapshot_id", updatable = false)
    private BehaviorAnalysisInputSnapshot analysisInputSnapshot;

    @Column(name = "policy_version", nullable = false, length = 50, updatable = false)
    private String policyVersion;

    @Column(name = "recommended_difficulty", nullable = false, updatable = false)
    private int recommendedDifficulty;

    @Column(name = "personalization_mode", nullable = false, length = 30, updatable = false)
    private String personalizationMode;

    @Column(name = "item_count", nullable = false, updatable = false)
    private int itemCount;

    @Column(name = "quantity_complexity", nullable = false, length = 20, updatable = false)
    private String quantityComplexity;

    @Column(name = "budget_pressure", nullable = false, length = 20, updatable = false)
    private String budgetPressure;

    @Column(name = "text_support", nullable = false, length = 20, updatable = false)
    private String textSupport;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reason_codes", nullable = false, columnDefinition = "jsonb", updatable = false)
    private List<String> reasonCodes;

    @Column(name = "generated_at", nullable = false, updatable = false)
    private Instant generatedAt;

    public MarketDifficultyRecommendation(Member member, BehaviorAnalysisInputSnapshot analysisInputSnapshot,
            String policyVersion, MarketPersonalizationDecision decision, Instant generatedAt) {
        this.member = member;
        this.analysisInputSnapshot = analysisInputSnapshot;
        this.policyVersion = policyVersion;
        this.recommendedDifficulty = decision.recommendedDifficulty();
        this.personalizationMode = decision.personalizationMode();
        this.itemCount = decision.itemCount();
        this.quantityComplexity = decision.quantityComplexity();
        this.budgetPressure = decision.budgetPressure();
        this.textSupport = decision.textSupport();
        this.reasonCodes = List.copyOf(decision.reasonCodes());
        this.generatedAt = generatedAt;
    }
}
