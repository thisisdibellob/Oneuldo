package oneuldo.quest.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestSubcategory;

// 퀘스트 세부 카테고리를 저장하고 조회하는 Repository
public interface QuestSubcategoryRepository
        extends JpaRepository<QuestSubcategory, UUID> {
}