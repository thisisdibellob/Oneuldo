package oneuldo.quest.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestChoice;

// 퀘스트 선택지 데이터를 조회하고 저장한다.
public interface QuestChoiceRepository extends JpaRepository<QuestChoice, UUID> {

    // 특정 단계의 선택지를 표시 순서대로 조회한다.
    List<QuestChoice> findAllByStepIdOrderByChoiceOrderAsc(UUID stepId);

    // 여러 단계의 선택지를 한 번에 조회해 상세 API의 반복 쿼리를 줄인다.
    List<QuestChoice> findAllByStepIdInOrderByChoiceOrderAsc(List<UUID> stepIds);
}
