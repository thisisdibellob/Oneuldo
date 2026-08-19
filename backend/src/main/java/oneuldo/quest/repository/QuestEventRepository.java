package oneuldo.quest.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Query("""
            SELECT event
            FROM QuestEvent event
            JOIN FETCH event.step
            WHERE event.session.id IN :sessionIds
            ORDER BY event.createdAt
            """)
    List<QuestEvent> findAllForSessions(@Param("sessionIds") List<UUID> sessionIds);
}
