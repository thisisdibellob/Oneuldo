package oneuldo.behaviorlog.analysis.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorAnalysisInputSnapshotRepository
        extends JpaRepository<BehaviorAnalysisInputSnapshot, UUID> {
    Optional<BehaviorAnalysisInputSnapshot> findFirstByMemberIdOrderByGeneratedAtDesc(UUID memberId);
    Optional<BehaviorAnalysisInputSnapshot> findByIdAndMemberId(UUID id, UUID memberId);
    java.util.List<BehaviorAnalysisInputSnapshot> findTop20ByMemberIdAndEventCountAndAnalysisFromOrderByGeneratedAtDesc(
            UUID memberId, int eventCount, java.time.Instant analysisFrom);
}
