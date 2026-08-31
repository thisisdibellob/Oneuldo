package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.personalization.domain.MarketAiDifficultyDraft;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import oneuldo.behaviorlog.personalization.repository.MarketDifficultyRecommendationRepository;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SkillPerformanceProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.repository.MemberRepository;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import oneuldo.simulationquest.llm.input.LlmSimulationInputService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class MarketDifficultyRecommendationService {

    private static final UUID MARKET_TEMPLATE_ID = UUID.fromString(
            "50000000-0000-0000-0000-000000000003");

    private final MemberRepository memberRepository;
    private final BehaviorProfileSnapshotRepository profileRepository;
    private final MarketDifficultyRecommendationRepository recommendationRepository;
    private final MarketDifficultyRecommendationPersistenceService persistenceService;
    private final MarketDifficultyRecommendationPolicy policy;
    private final LlmSimulationInputService inputService;
    private final MarketAiDifficultyPromptFactory promptFactory;
    private final MarketAiDifficultyValidator validator;
    private final GroqChatClient groqChatClient;
    private final ObjectMapper objectMapper;

    public MarketDifficultyRecommendationResponse recommend(UUID memberId) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없습니다."));
        BehaviorProfileSnapshot profile = profileRepository
                .findFirstByMemberIdOrderByGeneratedAtDesc(memberId).orElse(null);
        if (profile != null) {
            var existing = recommendationRepository.findByMemberIdAndProfileSnapshotId(
                    memberId, profile.getId());
            if (existing.isPresent()) return MarketDifficultyRecommendationResponse.from(existing.get());
        } else {
            var latest = recommendationRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId);
            if (latest.isPresent() && latest.get().getProfileSnapshot() == null) {
                return MarketDifficultyRecommendationResponse.from(latest.get());
            }
        }

        MarketPersonalizationDecisionWithVersion generated = generateDecision(memberId, profile);
        var saved = persistenceService.save(
                member, profile, generated.version(), generated.decision());
        return MarketDifficultyRecommendationResponse.from(saved);
    }

    public MarketDifficultyRecommendationResponse refresh(UUID memberId) {
        return recommend(memberId);
    }

    private Map<String, MarketSkillSignal> signals(BehaviorProfileSnapshot profile) {
        Map<String, MarketSkillSignal> result = new TreeMap<>();
        if (profile == null) return result;
        profile.getProfileData().skills().forEach((skillCode, skill) ->
                result.put(skillCode, signal(skill)));
        return result;
    }

    private MarketSkillSignal signal(SkillPerformanceProfile skill) {
        return new MarketSkillSignal(
                skill.independentSuccessRate(),
                skill.independentEvaluableEvidenceCount(),
                skill.distinctSessionCount(),
                skill.confidence());
    }

    private MarketPersonalizationDecisionWithVersion generateDecision(
            UUID memberId, BehaviorProfileSnapshot profile) {
        try {
            LlmSimulationGenerationInput input = inputService.build(memberId, MARKET_TEMPLATE_ID);
            String raw = groqChatClient.complete(
                    promptFactory.systemPrompt(), promptFactory.userPrompt(input), 350, 0.2).text();
            MarketAiDifficultyDraft draft = validator.validate(parse(raw));
            var decision = new MarketPersonalizationDecision(
                    draft.recommendedDifficulty(),
                    input.generationPlan().personalizationMode().name(),
                    draft.itemCount(), draft.quantityComplexity(), draft.budgetPressure(),
                    draft.textSupport(), draft.reasonCodes());
            return new MarketPersonalizationDecisionWithVersion(
                    decision, MarketAiDifficultyPromptFactory.PROMPT_VERSION);
        } catch (RuntimeException exception) {
            log.warn("AI 장보기 추천 난이도 생성 실패. 규칙형 추천으로 복구합니다. memberId={}, cause={}",
                    memberId, exception.getMessage());
            var fallback = policy.evaluate(signals(profile), profile != null);
            List<String> reasons = new java.util.ArrayList<>(fallback.reasonCodes());
            reasons.add("AI_DIFFICULTY_FALLBACK");
            var decision = new MarketPersonalizationDecision(
                    fallback.recommendedDifficulty(), fallback.personalizationMode(),
                    fallback.itemCount(), fallback.quantityComplexity(), fallback.budgetPressure(),
                    fallback.textSupport(), reasons);
            return new MarketPersonalizationDecisionWithVersion(
                    decision, MarketDifficultyRecommendationPolicy.POLICY_VERSION);
        }
    }

    private MarketAiDifficultyDraft parse(String rawText) {
        if (rawText == null || rawText.isBlank()) {
            throw new IllegalArgumentException("AI 장보기 난이도 응답이 비었습니다.");
        }
        int start = rawText.indexOf('{');
        int end = rawText.lastIndexOf('}');
        if (start < 0 || end < start) {
            throw new IllegalArgumentException("AI 장보기 난이도 응답에 JSON 객체가 없습니다.");
        }
        try {
            return objectMapper.readValue(
                    rawText.substring(start, end + 1), MarketAiDifficultyDraft.class);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("AI 장보기 난이도 JSON을 해석할 수 없습니다.", exception);
        }
    }

    private record MarketPersonalizationDecisionWithVersion(
            MarketPersonalizationDecision decision,
            String version
    ) {}
}
