package oneuldo.behaviorlog.personalization.service;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendation;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import oneuldo.behaviorlog.personalization.repository.MarketDifficultyRecommendationRepository;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MarketDifficultyRecommendationPersistenceService {

    private final MarketDifficultyRecommendationRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MarketDifficultyRecommendation save(Member member, BehaviorProfileSnapshot profile,
            String version, MarketPersonalizationDecision decision) {
        return repository.save(new MarketDifficultyRecommendation(
                member, profile, version, decision, Instant.now()));
    }
}
