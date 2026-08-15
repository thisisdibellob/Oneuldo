package oneuldo.quest.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestEvent;

public interface QuestEventRepository extends JpaRepository<QuestEvent, Long> {

    List<QuestEvent> findAllBySessionIdOrderByCreatedAtAsc(UUID sessionId);

    long countBySessionIdAndStepId(UUID sessionId, UUID stepId);

    boolean existsBySessionIdAndStepIdAndCorrectTrue(UUID sessionId, UUID stepId);

    Optional<QuestEvent> findBySessionIdAndStepIdAndAttemptNumber(
            UUID sessionId,
            UUID stepId,
            int attemptNumber
    );
}
