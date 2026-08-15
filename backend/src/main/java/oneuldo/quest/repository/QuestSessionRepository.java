package oneuldo.quest.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.QuestSession;

public interface QuestSessionRepository extends JpaRepository<QuestSession, UUID> {

    // 세션 소유자까지 함께 확인한다.
    Optional<QuestSession> findByIdAndMemberId(UUID sessionId, UUID memberId);
}
