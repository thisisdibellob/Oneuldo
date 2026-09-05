package oneuldo.behaviorlog.analysis.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiBehaviorAnalysisRepository extends JpaRepository<AiBehaviorAnalysisRun, UUID> {
    Optional<AiBehaviorAnalysisRun> findFirstByMemberIdOrderByCreatedAtDesc(UUID memberId);
    Optional<AiBehaviorAnalysisRun> findByIdAndMemberId(UUID id, UUID memberId);
    Optional<AiBehaviorAnalysisRun> findFirstByMemberIdAndDatasetIdAndRequestKeyAndStatusOrderByCreatedAtDesc(
            UUID memberId, UUID datasetId, String requestKey, String status);
}
