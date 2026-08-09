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

// 퀘스트 세부 카테고리 Entity
@Entity
@Table(name = "quest_subcategories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestSubcategory extends BaseTimeEntity {

    // 고유 식별자
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // 이 세부 카테고리가 속한 상위 카테고리
    // DB의 category_id 외래 키와 연결됨
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private QuestCategory category;

    // 백엔드와 프론트엔드에서 사용할 세부 카테고리 코드
    @Column(nullable = false, length = 50)
    private String code;

    // 앱에 표시할 세부 카테고리 이름
    @Column(nullable = false, length = 50)
    private String name;

    // 세부 카테고리에서 제공할 최소 난이도
    // Enum 값을 문자열로 DB에 저장함
    @Enumerated(EnumType.STRING)
    @Column(name = "min_difficulty", nullable = false, length = 20)
    private QuestDifficulty minDifficulty;

    // 세부 카테고리에서 제공할 최대 난이도
    @Enumerated(EnumType.STRING)
    @Column(name = "max_difficulty", nullable = false, length = 20)
    private QuestDifficulty maxDifficulty;

    // 같은 상위 카테고리 안에서 표시할 순서
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    // 사용자에게 보여줄 세부 카테고리인지 나타냄
    @Column(nullable = false)
    private boolean active;

    // 새로운 세부 카테고리를 만들 때 사용하는 생성자
    public QuestSubcategory(
            QuestCategory category,
            String code,
            String name,
            QuestDifficulty minDifficulty,
            QuestDifficulty maxDifficulty,
            int sortOrder,
            boolean active
    ) {
        this.category = category;
        this.code = code;
        this.name = name;
        this.minDifficulty = minDifficulty;
        this.maxDifficulty = maxDifficulty;
        this.sortOrder = sortOrder;
        this.active = active;
    }
}