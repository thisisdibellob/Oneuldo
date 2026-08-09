package oneuldo.quest.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestCategory;

// 퀘스트 상위 카테고리를 저장하고 조회하는 Repository
public interface QuestCategoryRepository
        extends JpaRepository<QuestCategory, UUID> {
}