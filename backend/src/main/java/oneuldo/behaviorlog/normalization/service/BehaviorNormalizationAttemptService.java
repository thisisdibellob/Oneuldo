package oneuldo.behaviorlog.normalization.service;

import java.time.Instant;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.BehaviorNormalizationAttempt;
import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorNormalizationAttemptRepository;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.member.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BehaviorNormalizationAttemptService {

    public static final int MAX_ATTEMPTS = 5;

    private final BehaviorNormalizationAttemptRepository attemptRepository;
    private final BehaviorLogRepository behaviorLogRepository;
    private final MemberRepository memberRepository;

    public BehaviorNormalizationAttemptService(BehaviorNormalizationAttemptRepository attemptRepository,
            BehaviorLogRepository behaviorLogRepository,
            MemberRepository memberRepository) {
        this.attemptRepository = attemptRepository;
        this.behaviorLogRepository = behaviorLogRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean begin(UUID behaviorLogId) {
        var log = behaviorLogRepository.findById(behaviorLogId)
                .orElseThrow(() -> new IllegalArgumentException("행동 로그를 찾을 수 없습니다: " + behaviorLogId));
        memberRepository.findByIdForUpdate(log.getMember().getId())
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        var existing = attemptRepository.findForUpdate(
                behaviorLogId, BehaviorNormalizationService.NORMALIZER_VERSION);
        if (existing.isPresent()) {
            var attempt = existing.get();
            if (attempt.getStatus() == NormalizationAttemptStatus.COMPLETED
                    || attempt.getStatus() == NormalizationAttemptStatus.DEAD_LETTER) {
                return false;
            }
            attempt.begin(Instant.now());
            return true;
        }
        attemptRepository.save(new BehaviorNormalizationAttempt(
                log, BehaviorNormalizationService.NORMALIZER_VERSION, Instant.now()));
        return true;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(UUID behaviorLogId) {
        var attempt = attemptRepository.findForUpdate(
                behaviorLogId, BehaviorNormalizationService.NORMALIZER_VERSION).orElseThrow();
        attempt.complete(Instant.now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(UUID behaviorLogId, Throwable throwable) {
        var attempt = attemptRepository.findForUpdate(
                behaviorLogId, BehaviorNormalizationService.NORMALIZER_VERSION).orElseThrow();
        attempt.fail(throwable, Instant.now(), MAX_ATTEMPTS);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void requestManualRetry(UUID behaviorLogId) {
        var attempt = attemptRepository.findForUpdate(
                behaviorLogId, BehaviorNormalizationService.NORMALIZER_VERSION).orElseThrow();
        if (attempt.getStatus() != NormalizationAttemptStatus.DEAD_LETTER) {
            throw new IllegalStateException("DEAD_LETTER 상태만 수동 재시도할 수 있습니다.");
        }
        attempt.requestManualRetry(Instant.now());
    }
}
