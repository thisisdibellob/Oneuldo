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

// 한 번의 퀘스트 수행 상태를 저장한다.
@Entity
@Table(name = "quest_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quest_id", nullable = false)
    private Quest quest;

    @Enumerated(EnumType.STRING)
    @Column(name = "quest_difficulty", nullable = false, length = 20)
    private QuestDifficulty questDifficulty;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QuestSessionStatus status;

    @Column(name = "total_steps", nullable = false)
    private int totalSteps;

    @Column(name = "completed_steps", nullable = false)
    private int completedSteps;

    @Column(name = "reward_points", nullable = false)
    private int rewardPoints;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "abandoned_at")
    private Instant abandonedAt;

    @Column(name = "abandon_reason", length = 50)
    private String abandonReason;

    public QuestSession(Member member, Quest quest, int totalSteps) {
        this.member = member;
        this.quest = quest;
        this.questDifficulty = quest.getDifficulty();
        this.status = QuestSessionStatus.IN_PROGRESS;
        this.totalSteps = totalSteps;
        this.completedSteps = 0;
        this.rewardPoints = 0;
        this.startedAt = Instant.now();
    }

    // 처음 정답 처리된 단계의 수를 올린다.
    public void completeStep() {
        if (completedSteps < totalSteps) {
            completedSteps++;
        }
    }

    public void complete(int rewardPoints) {
        status = QuestSessionStatus.COMPLETED;
        this.rewardPoints = rewardPoints;
        completedAt = Instant.now();
    }

    public void abandon(String reason) {
        status = QuestSessionStatus.ABANDONED;
        abandonReason = reason;
        abandonedAt = Instant.now();
    }
}
