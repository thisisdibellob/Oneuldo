package oneuldo.behaviorlog.normalization.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class BehaviorNormalizationListener {

    private final BehaviorNormalizationProcessor normalizationProcessor;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void normalizeAfterCommit(BehaviorLogSavedEvent event) {
        try {
            normalizationProcessor.process(event.behaviorLogId());
        } catch (RuntimeException exception) {
            log.error("행동 로그 후속 정규화 작업을 시작하지 못했습니다. behaviorLogId={}",
                    event.behaviorLogId(), exception);
        }
    }
}
