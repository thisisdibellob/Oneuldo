package oneuldo.behaviorlog.normalization.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class BehaviorNormalizationTransactionExecutor {

    private final BehaviorLogRepository behaviorLogRepository;
    private final BehaviorSessionIntegrityService sessionIntegrityService;
    private final BehaviorNormalizationService normalizationService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void normalizeWithSessionIntegrity(UUID behaviorLogId) {
        var log = behaviorLogRepository.findById(behaviorLogId)
                .orElseThrow(() -> new IllegalArgumentException("행동 로그를 찾을 수 없습니다: " + behaviorLogId));
        sessionIntegrityService.reconcile(log.getMember().getId(), log.getSessionId());
        normalizationService.normalize(behaviorLogId);
    }
}
