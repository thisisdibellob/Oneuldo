package oneuldo.behaviorlog.normalization.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.time.Instant;
import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorNormalizationAttemptRepository;
import org.springframework.data.domain.PageRequest;

@Slf4j
@Component
@RequiredArgsConstructor
public class BehaviorNormalizationRecoveryJob {

    private final BehaviorNormalizationService normalizationService;
    private final BehaviorNormalizationProcessor normalizationProcessor;
    private final BehaviorNormalizationAttemptRepository attemptRepository;

    @Value("${behavior-log.normalization.recovery-batch-size:100}")
    private int batchSize;

    @Scheduled(fixedDelayString = "${behavior-log.normalization.recovery-delay:PT1M}")
    public void normalizeMissingLogs() {
        for (var behaviorLogId : normalizationService.findMissingIds(batchSize)) {
            processSafely(behaviorLogId);
        }
        Instant now = Instant.now();
        var recoverableIds = attemptRepository.findRecoverableBehaviorLogIds(
                now,
                now.minus(Duration.ofMinutes(10)),
                NormalizationAttemptStatus.RETRY,
                NormalizationAttemptStatus.PROCESSING,
                PageRequest.of(0, batchSize)
        );
        for (var behaviorLogId : recoverableIds) {
            processSafely(behaviorLogId);
        }
    }

    private void processSafely(java.util.UUID behaviorLogId) {
        try {
            normalizationProcessor.process(behaviorLogId);
        } catch (RuntimeException exception) {
            log.error("행동 로그 정규화 재처리를 시작하지 못했습니다. behaviorLogId={}",
                    behaviorLogId, exception);
        }
    }
}
