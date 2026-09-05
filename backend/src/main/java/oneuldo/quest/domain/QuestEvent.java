package oneuldo.quest.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

// 사용자가 단계에서 선택한 내용을 원본 이벤트로 보존한다.
@Entity
@Table(name = "quest_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private QuestSession session;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "step_id", nullable = false)
    private QuestStep step;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "choice_id", nullable = false)
    private QuestChoice choice;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Column
    private Boolean correct;

    /** Historical rule replay only; null is unassessed, not false. */
    public boolean isCorrect() { return Boolean.TRUE.equals(correct); }

    @Column(name = "hint_used", nullable = false)
    private boolean hintUsed;

    @Column(name = "response_time_ms", nullable = false)
    private long responseTimeMs;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public QuestEvent(
            QuestSession session,
            QuestStep step,
            QuestChoice choice,
            int attemptNumber,
            boolean hintUsed,
            long responseTimeMs
    ) {
        this.session = session;
        this.step = step;
        this.choice = choice;
        this.attemptNumber = attemptNumber;
        this.correct = null;
        this.hintUsed = hintUsed;
        this.responseTimeMs = responseTimeMs;
        this.createdAt = Instant.now();
    }
}
