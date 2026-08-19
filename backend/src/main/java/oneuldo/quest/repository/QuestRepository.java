package oneuldo.quest.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestDifficulty;

// 퀘스트를 저장하고 조회하는 Repository
public interface QuestRepository extends JpaRepository<Quest, UUID> {

    // 활성화된 카테고리와 퀘스트를 화면 표시 순서대로 조회함
    @Query("""
            SELECT q
            FROM Quest q
            JOIN FETCH q.subcategory s
            JOIN FETCH s.category c
            WHERE q.active = true
              AND s.active = true
              AND c.active = true
            ORDER BY c.sortOrder, s.sortOrder, q.title
            """)
    List<Quest> findAllActiveWithCategory();

    boolean existsBySubcategoryIdAndDifficultyAndActiveTrue(
            UUID subcategoryId,
            QuestDifficulty difficulty
    );
}
