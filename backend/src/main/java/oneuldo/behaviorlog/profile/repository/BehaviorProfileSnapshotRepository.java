package oneuldo.behaviorlog.profile.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorProfileSnapshotRepository
        extends JpaRepository<BehaviorProfileSnapshot, UUID> {
    Optional<BehaviorProfileSnapshot> findFirstByMemberIdOrderByGeneratedAtDesc(UUID memberId);
}
