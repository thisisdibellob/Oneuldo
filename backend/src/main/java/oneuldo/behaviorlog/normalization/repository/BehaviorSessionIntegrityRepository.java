package oneuldo.behaviorlog.normalization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.BehaviorSessionIntegrity;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorSessionIntegrityRepository
        extends JpaRepository<BehaviorSessionIntegrity, UUID> {
    Optional<BehaviorSessionIntegrity> findByMemberIdAndSessionId(UUID memberId, UUID sessionId);
    List<BehaviorSessionIntegrity> findAllByMemberIdAndSessionIdIn(
            UUID memberId, List<UUID> sessionIds);
    long countByStatus(SessionIntegrityStatus status);
}
