package oneuldo.quest.domain;

import java.util.UUID;

import oneuldo.global.entity.BaseTimeEntity;

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

// 사용자가 수행할 퀘스트 Entity
@Entity
@Table(name = "quests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Quest extends BaseTimeEntity {

    // 고유 식별자
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // 퀘스트가 속한 세부 카테고리
    // DB의 subcategory_id 외래 키와 연결됨
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subcategory_id", nullable = false)
    private QuestSubcategory subcategory;

    // 백엔드에서 퀘스트를 구분할 때 사용하는 코드
    @Column(nullable = false, unique = true, length = 100)
    private String code;

    // 앱 퀘스트 카드에 표시할 제목
    @Column(nullable = false, length = 100)
    private String title;

    // 앱 퀘스트 카드에 표시할 짧은 설명
    @Column(nullable = false, length = 500)
    private String summary;

    // 사용자가 퀘스트를 통해 학습할 목표
    @Column(nullable = false, length = 500)
    private String goal;

    // 퀘스트 난이도
    // Enum 값을 문자열로 DB에 저장함
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QuestDifficulty difficulty;

    // 퀘스트 완료 시 지급할 경험치
    @Column(name = "reward_points", nullable = false)
    private int rewardPoints;

    // 사용자에게 보여줄 퀘스트인지 나타냄
    @Column(nullable = false)
    private boolean active;

    // 새로운 퀘스트를 만들 때 사용하는 생성자
    public Quest(
            QuestSubcategory subcategory,
            String code,
            String title,
            String summary,
            String goal,
            QuestDifficulty difficulty,
            int rewardPoints,
            boolean active
    ) {
        this.subcategory = subcategory;
        this.code = code;
        this.title = title;
        this.summary = summary;
        this.goal = goal;
        this.difficulty = difficulty;
        this.rewardPoints = rewardPoints;
        this.active = active;
    }
}