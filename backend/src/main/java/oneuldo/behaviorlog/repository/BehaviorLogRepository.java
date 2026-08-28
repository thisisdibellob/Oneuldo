package oneuldo.behaviorlog.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BehaviorLogRepository extends JpaRepository<BehaviorLog, UUID> {

    Optional<BehaviorLog> findByMemberIdAndClientEventId(UUID memberId, UUID clientEventId);

    Optional<BehaviorLog> findByMemberIdAndSessionIdAndEventSequence(
            UUID memberId,
            UUID sessionId,
            long eventSequence
    );

    List<BehaviorLog> findAllByMemberIdOrderByOccurredAtAsc(UUID memberId);

    @Query("""
            select log.eventSequence
            from BehaviorLog log
            where log.member.id = :memberId and log.sessionId = :sessionId
            order by log.eventSequence
            """)
    List<Long> findEventSequencesByMemberIdAndSessionId(
            @Param("memberId") UUID memberId,
            @Param("sessionId") UUID sessionId
    );

    boolean existsByMemberIdAndSessionIdAndSessionEndContextIsNotNull(
            UUID memberId,
            UUID sessionId
    );

    boolean existsByMemberIdAndSessionIdAndEventSequence(
            UUID memberId,
            UUID sessionId,
            long eventSequence
    );

    @Query("""
            select log.id
            from BehaviorLog log
            where not exists (
                select normalized.id
                from NormalizedBehaviorEvent normalized
                where normalized.behaviorLog = log
                  and normalized.normalizerVersion = :normalizerVersion
            )
              and not exists (
                select attempt.id
                from BehaviorNormalizationAttempt attempt
                where attempt.behaviorLog = log
                  and attempt.normalizerVersion = :normalizerVersion
              )
            order by log.receivedAt
            """)
    List<UUID> findIdsMissingNormalization(
            @Param("normalizerVersion") String normalizerVersion,
            Pageable pageable
    );
}
