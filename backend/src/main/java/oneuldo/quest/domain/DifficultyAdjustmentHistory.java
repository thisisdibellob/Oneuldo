package oneuldo.quest.domain;

import java.time.Instant;
import java.util.UUID;

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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.member.domain.Member;
import oneuldo.quest.service.DifficultyMetrics;

// 난이도 판단 당시의 지표와 사유를 변경 불가능한 이력으로 남긴다.
@Entity
@Table(name = "difficulty_adjustment_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DifficultyAdjustmentHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subcategory_id", nullable = false)
    private QuestSubcategory subcategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_difficulty", nullable = false, length = 20)
    private QuestDifficulty previousDifficulty;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_difficulty", nullable = false, length = 20)
    private QuestDifficulty newDifficulty;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DifficultyAdjustmentDecision decision;

    @Column(name = "reason_codes", nullable = false, length = 500)
    private String reasonCodes;

    @Column(name = "evaluated_session_count", nullable = false)
    private int evaluatedSessionCount;

    @Column(name = "evaluated_step_count", nullable = false)
    private int evaluatedStepCount;

    @Column(name = "completion_rate", nullable = false)
    private double completionRate;

    @Column(name = "first_attempt_accuracy", nullable = false)
    private double firstAttemptAccuracy;

    @Column(name = "hint_use_rate", nullable = false)
    private double hintUseRate;

    @Column(name = "retry_rate", nullable = false)
    private double retryRate;

    @Column(name = "distinct_quest_count", nullable = false)
    private int distinctQuestCount;

    @Column(name = "rule_version", nullable = false, length = 50)
    private String ruleVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public DifficultyAdjustmentHistory(
            UserSubcategoryDifficulty state,
            QuestDifficulty previousDifficulty,
            QuestDifficulty newDifficulty,
            DifficultyAdjustmentDecision decision,
            String reasonCodes,
            DifficultyMetrics metrics,
            String ruleVersion,
            Instant createdAt
    ) {
        this.member = state.getMember();
        this.subcategory = state.getSubcategory();
        this.previousDifficulty = previousDifficulty;
        this.newDifficulty = newDifficulty;
        this.decision = decision;
        this.reasonCodes = reasonCodes;
        this.evaluatedSessionCount = metrics.sessionCount();
        this.evaluatedStepCount = metrics.stepCount();
        this.completionRate = metrics.completionRate();
        this.firstAttemptAccuracy = metrics.firstAttemptAccuracy();
        this.hintUseRate = metrics.hintUseRate();
        this.retryRate = metrics.retryRate();
        this.distinctQuestCount = metrics.distinctQuestCount();
        this.ruleVersion = ruleVersion;
        this.createdAt = createdAt;
    }
}
