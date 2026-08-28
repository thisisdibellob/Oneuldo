package oneuldo.behaviorlog.normalization.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorMeasurement;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NormalizedBehaviorMeasurementRepository
        extends JpaRepository<NormalizedBehaviorMeasurement, UUID> {
    List<NormalizedBehaviorMeasurement> findAllByNormalizedEventId(UUID normalizedEventId);
}
