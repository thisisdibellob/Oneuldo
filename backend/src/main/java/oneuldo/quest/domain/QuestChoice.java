package oneuldo.quest.domain;

import java.util.UUID;

import oneuldo.global.entity.BaseTimeEntity;

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

// 퀘스트 단계에서 사용자가 선택할 수 있는 하나의 답변
@Entity
@Table(name = "quest_choices")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestChoice extends BaseTimeEntity {

    // 선택지의 고유 식별자
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // 이 선택지가 속한 퀘스트 단계
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "step_id", nullable = false)
    private QuestStep step;

    // 단계 안에서 선택지가 표시되는 순서
    @Column(name = "choice_order", nullable = false)
    private int choiceOrder;

    // 사용자 화면에 표시할 선택지 문장
    @Column(nullable = false, length = 500)
    private String label;

    // 서버가 정답 여부를 판정할 때 사용하는 값
    @Column(nullable = false)
    private boolean correct;

    // 선택 후 사용자에게 보여줄 설명
    @Column(nullable = false, length = 500)
    private String feedback;

    // 새로운 선택지를 만들 때 사용한다.
    public QuestChoice(
            QuestStep step,
            int choiceOrder,
            String label,
            boolean correct,
            String feedback
    ) {
        this.step = step;
        this.choiceOrder = choiceOrder;
        this.label = label;
        this.correct = correct;
        this.feedback = feedback;
    }
}
