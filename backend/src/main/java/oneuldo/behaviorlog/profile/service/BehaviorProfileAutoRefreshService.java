package oneuldo.behaviorlog.profile.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.behaviorlog.personalization.service.MarketDifficultyRecommendationService;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class BehaviorProfileAutoRefreshService {

    private final BehaviorLogRepository behaviorLogRepository;
    private final BehaviorSessionIntegrityRepository integrityRepository;
    private final NormalizedBehaviorEventRepository normalizedEventRepository;
    private final BehaviorProfileService profileService;
    private final MarketDifficultyRecommendationService marketRecommendationService;

    public boolean refreshIfComplete(UUID behaviorLogId) {
        var log = behaviorLogRepository.findById(behaviorLogId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "행동 로그를 찾을 수 없습니다: " + behaviorLogId));
        UUID memberId = log.getMember().getId();
        UUID sessionId = log.getSessionId();
        var integrity = integrityRepository.findByMemberIdAndSessionId(memberId, sessionId)
                .orElse(null);
        if (integrity == null || integrity.getStatus() != SessionIntegrityStatus.COMPLETE) {
            return false;
        }
        long normalizedCount = normalizedEventRepository.countNormalizedSessionEvents(
                memberId, sessionId, BehaviorNormalizationService.NORMALIZER_VERSION);
        if (normalizedCount != integrity.getReceivedEventCount()) return false;

        var profile = profileService.generateForCompletedSession(memberId, sessionId);
        marketRecommendationService.refresh(memberId);
        logProfile(sessionId, integrity.getReceivedEventCount(), profile.inputEventCount());
        return true;
    }

    private void logProfile(UUID sessionId, long sessionEventCount, int profileEventCount) {
        log.info("[BehaviorPilot][5/5] PROFILE session={} sessionEvents={} profileEvents={}",
                sessionId, sessionEventCount, profileEventCount);
    }
}
