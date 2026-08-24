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

// 사용자별·세부 분야별 현재 권장 난이도를 저장한다.
@Entity
@Table(name = "user_subcategory_difficulties")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserSubcategoryDifficulty {

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
    @Column(name = "current_difficulty", nullable = false, length = 20)
    private QuestDifficulty currentDifficulty;

    @Column(name = "sessions_since_evaluation", nullable = false)
    private int sessionsSinceEvaluation;

    @Column(name = "last_evaluated_at")
    private Instant lastEvaluatedAt;

    @Column(name = "last_changed_at")
    private Instant lastChangedAt;

    @Column(name = "rule_version", nullable = false, length = 50)
    private String ruleVersion;

    public UserSubcategoryDifficulty(Member member, QuestSubcategory subcategory, String ruleVersion) {
        this.member = member;
        this.subcategory = subcategory;
        this.currentDifficulty = QuestDifficulty.VERY_EASY;
        this.sessionsSinceEvaluation = 0;
        this.ruleVersion = ruleVersion;
    }

    // 현재 난이도로 끝낸 세션만 다음 평가 표본에 포함한다.
    public void recordEligibleSession() {
        sessionsSinceEvaluation++;
    }

    public void finishEvaluation(QuestDifficulty nextDifficulty, String nextRuleVersion, Instant now) {
        if (currentDifficulty != nextDifficulty) {
            currentDifficulty = nextDifficulty;
            lastChangedAt = now;
        }
        sessionsSinceEvaluation = 0;
        lastEvaluatedAt = now;
        ruleVersion = nextRuleVersion;
    }
}
