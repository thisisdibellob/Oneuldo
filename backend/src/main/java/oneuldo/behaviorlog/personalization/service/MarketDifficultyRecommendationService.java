package oneuldo.behaviorlog.personalization.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import oneuldo.member.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class MarketDifficultyRecommendationService {
    private final MemberRepository memberRepository;
    private final BehaviorAnalysisInputSnapshotRepository analysisInputRepository;
    private final MarketDifficultyRecommendationPersistenceService persistenceService;
    private final MarketProfileFreshnessService freshness;

    public MarketDifficultyRecommendationResponse recommend(UUID memberId) {
        var member = memberRepository.findById(memberId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        var profile = freshness.requireCurrent(memberId);
        var snapshot = analysisInputRepository.findByIdAndMemberId(profile.sourceDatasetId(), memberId).orElseThrow();
        var plan = profile.profile().practicePlan();
        var decision = new MarketPersonalizationDecision(plan.recommendedDifficulty(), "AI_PROFILE",
                plan.itemCount(), plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport(), plan.reasonCodes());
        return MarketDifficultyRecommendationResponse.from(persistenceService.save(member, snapshot,
                profile.sourceAnalysisId(), profile.profileId(), profile.profileVersion(), profile.promptVersion(), decision));
    }

    public MarketDifficultyRecommendationResponse refresh(UUID memberId) { return recommend(memberId); }
}
