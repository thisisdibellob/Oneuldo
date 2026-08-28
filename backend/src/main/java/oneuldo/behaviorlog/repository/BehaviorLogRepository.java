package oneuldo.behaviorlog.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorLogRepository extends JpaRepository<BehaviorLog, UUID> {

    Optional<BehaviorLog> findByMemberIdAndClientEventId(UUID memberId, UUID clientEventId);

    Optional<BehaviorLog> findByMemberIdAndSessionIdAndEventSequence(
            UUID memberId,
            UUID sessionId,
            long eventSequence
    );

    List<BehaviorLog> findAllByMemberIdOrderByOccurredAtAsc(UUID memberId);
}
