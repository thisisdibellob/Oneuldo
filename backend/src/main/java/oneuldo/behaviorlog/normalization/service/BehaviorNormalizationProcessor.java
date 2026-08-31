package oneuldo.behaviorlog.normalization.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.behaviorlog.profile.service.BehaviorProfileAutoRefreshService;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class BehaviorNormalizationProcessor {

    private final BehaviorLogRepository behaviorLogRepository;
    private final BehaviorNormalizationAttemptService attemptService;
    private final BehaviorNormalizationTransactionExecutor transactionExecutor;
    private final BehaviorProfileAutoRefreshService profileAutoRefreshService;

    public boolean process(UUID behaviorLogId) {
        if (!behaviorLogRepository.existsById(behaviorLogId)) {
            throw new IllegalArgumentException("행동 로그를 찾을 수 없습니다: " + behaviorLogId);
        }
        if (!attemptService.begin(behaviorLogId)) return false;
        try {
            transactionExecutor.normalizeWithSessionIntegrity(behaviorLogId);
            attemptService.complete(behaviorLogId);
            try {
                profileAutoRefreshService.refreshIfComplete(behaviorLogId);
            } catch (RuntimeException exception) {
                log.error("완료 세션의 행동 프로파일 자동 갱신에 실패했습니다. behaviorLogId={}",
                        behaviorLogId, exception);
            }
            return true;
        } catch (RuntimeException exception) {
            attemptService.fail(behaviorLogId, exception);
            log.error("행동 로그 정규화에 실패했습니다. behaviorLogId={}", behaviorLogId, exception);
            return false;
        }
    }
}
