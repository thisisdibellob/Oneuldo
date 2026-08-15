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

// 퀘스트를 구성하는 하나의 진행 단계
@Entity
@Table(name = "quest_steps")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestStep extends BaseTimeEntity {

    // 단계의 고유 식별자
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // 이 단계가 속한 퀘스트
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quest_id", nullable = false)
    private Quest quest;

    // 퀘스트 내부 진행 순서
    @Column(name = "step_order", nullable = false)
    private int stepOrder;

    // 사용자에게 보여줄 행동 안내
    @Column(nullable = false, length = 300)
    private String instruction;

    // 현재 장면이나 상황에 대한 설명
    @Column(nullable = false, length = 1000)
    private String situation;

    // 사용자가 막혔을 때 보여줄 기본 힌트
    // DB에서 NULL을 허용하므로 nullable=false를 사용하지 않는다.
    @Column(length = 500)
    private String hint;

    // 새로운 퀘스트 단계를 만들 때 사용한다.
    public QuestStep(
            Quest quest,
            int stepOrder,
            String instruction,
            String situation,
            String hint
    ) {
        this.quest = quest;
        this.stepOrder = stepOrder;
        this.instruction = instruction;
        this.situation = situation;
        this.hint = hint;
    }
}