package oneuldo.behaviorlog.normalization.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NormalizedBehaviorEventRepository
        extends JpaRepository<NormalizedBehaviorEvent, UUID> {
    Optional<NormalizedBehaviorEvent> findByBehaviorLogIdAndNormalizerVersion(
            UUID behaviorLogId, String normalizerVersion);

    @Query("""
            select event
            from NormalizedBehaviorEvent event
            join fetch event.behaviorLog log
            left join fetch event.sessionIntegrity integrity
            where log.id in :behaviorLogIds
              and event.normalizerVersion = :normalizerVersion
            """)
    List<NormalizedBehaviorEvent> findAnalysisInputEvents(
            @Param("behaviorLogIds") List<UUID> behaviorLogIds,
            @Param("normalizerVersion") String normalizerVersion
    );

    long countByNormalizationStatus(NormalizationStatus status);

    List<NormalizedBehaviorEvent> findByNormalizationStatusOrderByNormalizedAtDesc(
            NormalizationStatus status, Pageable pageable);

}
