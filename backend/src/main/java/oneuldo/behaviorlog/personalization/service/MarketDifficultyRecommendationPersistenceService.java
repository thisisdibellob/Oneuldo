package oneuldo.behaviorlog.personalization.service;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendation;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import oneuldo.behaviorlog.personalization.repository.MarketDifficultyRecommendationRepository;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import oneuldo.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MarketDifficultyRecommendationPersistenceService {

    private final MarketDifficultyRecommendationRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MarketDifficultyRecommendation save(Member member, BehaviorAnalysisInputSnapshot analysisInput,
            java.util.UUID analysisId, java.util.UUID profileId, long profileVersion,
            String version, MarketPersonalizationDecision decision) {
        var existing = repository.findByMemberIdAndProfileId(member.getId(), profileId);
        if (existing.isPresent()) return existing.get();
        return repository.save(new MarketDifficultyRecommendation(
                member, analysisInput, analysisId, profileId, profileVersion, version, decision, Instant.now()));
    }
}
