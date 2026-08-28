package oneuldo.behaviorlog.normalization.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import org.springframework.data.domain.Pageable;

public interface NormalizedBehaviorEventRepository
        extends JpaRepository<NormalizedBehaviorEvent, UUID> {
    Optional<NormalizedBehaviorEvent> findByBehaviorLogIdAndNormalizerVersion(
            UUID behaviorLogId, String normalizerVersion);

    long countByNormalizationStatus(NormalizationStatus status);

    List<NormalizedBehaviorEvent> findByNormalizationStatusOrderByNormalizedAtDesc(
            NormalizationStatus status, Pageable pageable);
}
