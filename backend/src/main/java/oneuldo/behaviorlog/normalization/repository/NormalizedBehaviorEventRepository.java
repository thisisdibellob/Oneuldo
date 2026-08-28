package oneuldo.behaviorlog.normalization.repository;

import java.time.Instant;
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

    long countByNormalizationStatus(NormalizationStatus status);

    List<NormalizedBehaviorEvent> findByNormalizationStatusOrderByNormalizedAtDesc(
            NormalizationStatus status, Pageable pageable);

    @Query("""
            select distinct event
            from NormalizedBehaviorEvent event
            join fetch event.behaviorLog log
            left join fetch event.sessionIntegrity integrity
            where log.member.id = :memberId
              and event.normalizerVersion = :normalizerVersion
              and event.registryVersion = :registryVersion
              and event.measurementRuleVersion = :measurementRuleVersion
              and event.occurredAt between :evidenceFrom and :evidenceTo
            order by event.occurredAt
            """)
    List<NormalizedBehaviorEvent> findProfileInputEvents(
            @Param("memberId") UUID memberId,
            @Param("normalizerVersion") String normalizerVersion,
            @Param("registryVersion") String registryVersion,
            @Param("measurementRuleVersion") String measurementRuleVersion,
            @Param("evidenceFrom") Instant evidenceFrom,
            @Param("evidenceTo") Instant evidenceTo
    );
}
