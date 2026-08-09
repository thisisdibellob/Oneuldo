package oneuldo.quest.domain;

import java.util.UUID;

import oneuldo.global.entity.BaseTimeEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

//퀘스트 상위 카테고리 entity

@Entity
@Table(name = "quest_categories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuestCategory extends BaseTimeEntity {

    //고유 식별자
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    //카테고리 이름
    //백엔드와 프론트엔드에서 카테고리를 구분할 때 사용됨
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    //앱에서 표시할 카테고리 이름
    @Column(nullable = false, length = 50)
    private String name;

    //앱 화면에 카테고리를 표시할 순서
    //숫자가 낮을수록 먼저 표시됨
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    //사용자에게 보여줄 카테고리인지 나타냄
    @Column(nullable = false)
    private boolean active;

    //새로운 카테고리를 만들 때 사용하는 생성자
    public QuestCategory(String code, String name, int sortOrder, boolean active) {
        this.code = code;
        this.name = name;
        this.sortOrder = sortOrder;
        this.active = active;
    }
}