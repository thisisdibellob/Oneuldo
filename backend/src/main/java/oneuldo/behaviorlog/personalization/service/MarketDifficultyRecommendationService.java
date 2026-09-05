package oneuldo.behaviorlog.personalization.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisService;
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
    private final AiBehaviorAnalysisService analysisService;
    private final BehaviorAnalysisInputSnapshotRepository analysisInputRepository;
    private final MarketDifficultyRecommendationPersistenceService persistenceService;

    public MarketDifficultyRecommendationResponse recommend(UUID memberId) {
        var member = memberRepository.findById(memberId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        var analysis = analysisService.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        if (!"READY".equals(analysis.status())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI 분석이 준비되지 않았습니다: " + analysis.status());
        }
        var snapshot = analysisInputRepository.findByIdAndMemberId(analysis.datasetId(), memberId).orElseThrow();
        var plan = analysis.analysis().practicePlan();
        var decision = new MarketPersonalizationDecision(plan.recommendedDifficulty(), "AI_ANALYSIS",
                plan.itemCount(), plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport(), plan.reasonCodes());
        return MarketDifficultyRecommendationResponse.from(persistenceService.save(member, snapshot,
                analysis.analysisId(), analysis.promptVersion(), decision));
    }

    public MarketDifficultyRecommendationResponse refresh(UUID memberId) { return recommend(memberId); }
}
