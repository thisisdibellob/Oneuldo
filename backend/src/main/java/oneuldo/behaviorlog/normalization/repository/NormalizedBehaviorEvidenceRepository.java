package oneuldo.behaviorlog.normalization.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvidence;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NormalizedBehaviorEvidenceRepository
        extends JpaRepository<NormalizedBehaviorEvidence, UUID> {
    List<NormalizedBehaviorEvidence> findAllByNormalizedEventId(UUID normalizedEventId);
}
