package oneuldo.behaviorlog.normalization.service;

import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorNormalizationAttemptRepository;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import org.springframework.data.domain.PageRequest;

@Service
public class BehaviorNormalizationMonitoringService {

    private final BehaviorLogRepository behaviorLogRepository;
    private final NormalizedBehaviorEventRepository eventRepository;
    private final BehaviorNormalizationAttemptRepository attemptRepository;
    private final BehaviorSessionIntegrityRepository sessionIntegrityRepository;

    public BehaviorNormalizationMonitoringService(BehaviorLogRepository behaviorLogRepository,
            NormalizedBehaviorEventRepository eventRepository,
            BehaviorNormalizationAttemptRepository attemptRepository,
            BehaviorSessionIntegrityRepository sessionIntegrityRepository) {
        this.behaviorLogRepository = behaviorLogRepository;
        this.eventRepository = eventRepository;
        this.attemptRepository = attemptRepository;
        this.sessionIntegrityRepository = sessionIntegrityRepository;
    }

    @Transactional(readOnly = true)
    public BehaviorNormalizationSummary getSummary() {
        return new BehaviorNormalizationSummary(
                behaviorLogRepository.count(),
                eventRepository.countByNormalizationStatus(NormalizationStatus.NORMALIZED),
                eventRepository.countByNormalizationStatus(NormalizationStatus.QUARANTINED),
                attemptRepository.countByStatus(NormalizationAttemptStatus.RETRY),
                attemptRepository.countByStatus(NormalizationAttemptStatus.DEAD_LETTER),
                sessionIntegrityRepository.countByStatus(SessionIntegrityStatus.OPEN_WITH_GAPS),
                sessionIntegrityRepository.countByStatus(SessionIntegrityStatus.GAPPED)
        );
    }

    @Transactional(readOnly = true)
    public List<QuarantinedNormalizationData> getQuarantined(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 200));
        return eventRepository.findByNormalizationStatusOrderByNormalizedAtDesc(
                        NormalizationStatus.QUARANTINED, PageRequest.of(0, safeLimit)).stream()
                .map(event -> new QuarantinedNormalizationData(
                        event.getId(), event.getBehaviorLog().getId(), event.getSourceEventCode(),
                        event.getValidityStatus(), event.getNormalizationIssues(), event.getNormalizedAt()))
                .toList();
    }
}
