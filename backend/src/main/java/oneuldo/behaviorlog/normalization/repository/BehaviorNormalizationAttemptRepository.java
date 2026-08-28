package oneuldo.behaviorlog.normalization.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.BehaviorNormalizationAttempt;
import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface BehaviorNormalizationAttemptRepository
        extends JpaRepository<BehaviorNormalizationAttempt, UUID> {
    Optional<BehaviorNormalizationAttempt> findByBehaviorLogIdAndNormalizerVersion(
            UUID behaviorLogId, String normalizerVersion);

    long countByStatus(NormalizationAttemptStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select attempt from BehaviorNormalizationAttempt attempt
            where attempt.behaviorLog.id = :behaviorLogId
              and attempt.normalizerVersion = :normalizerVersion
            """)
    Optional<BehaviorNormalizationAttempt> findForUpdate(
            @Param("behaviorLogId") UUID behaviorLogId,
            @Param("normalizerVersion") String normalizerVersion);

    List<BehaviorNormalizationAttempt> findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAt(
            NormalizationAttemptStatus status, Instant now, Pageable pageable);

    @Query("""
            select attempt.behaviorLog.id
            from BehaviorNormalizationAttempt attempt
            where (attempt.status = :retryStatus and attempt.nextRetryAt <= :now)
               or (attempt.status = :processingStatus and attempt.lastAttemptedAt <= :staleBefore)
            order by attempt.lastAttemptedAt
            """)
    List<UUID> findRecoverableBehaviorLogIds(
            @Param("now") Instant now,
            @Param("staleBefore") Instant staleBefore,
            @Param("retryStatus") NormalizationAttemptStatus retryStatus,
            @Param("processingStatus") NormalizationAttemptStatus processingStatus,
            Pageable pageable
    );
}
