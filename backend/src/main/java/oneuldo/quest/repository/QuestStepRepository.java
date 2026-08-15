package oneuldo.quest.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestStep;

// 퀘스트 단계 데이터를 조회하고 저장한다.
public interface QuestStepRepository extends JpaRepository<QuestStep, UUID> {

    // 특정 퀘스트의 단계를 진행 순서대로 조회한다.
    List<QuestStep> findAllByQuestIdOrderByStepOrderAsc(UUID questId); //JPA가 메서드 이름을 분석 -> 자동 쿼리 생성

    long countByQuestId(UUID questId);
}
