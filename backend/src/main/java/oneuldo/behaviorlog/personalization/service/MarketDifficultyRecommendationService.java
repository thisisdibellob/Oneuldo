package oneuldo.behaviorlog.personalization.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService;
import oneuldo.behaviorlog.personalization.domain.MarketAiDifficultyDraft;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import oneuldo.member.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class MarketDifficultyRecommendationService {

    private final MemberRepository memberRepository;
    private final BehaviorAnalysisInputService analysisInputService;
    private final BehaviorAnalysisInputSnapshotRepository analysisInputRepository;
    private final MarketDifficultyRecommendationPersistenceService persistenceService;
    private final MarketAiDifficultyPromptFactory promptFactory;
    private final MarketAiDifficultyValidator validator;
    private final GroqChatClient groqChatClient;
    private final ObjectMapper objectMapper;

    public MarketDifficultyRecommendationResponse recommend(UUID memberId) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없습니다."));
        BehaviorAnalysisInputResponse analysisInput = analysisInputService.create(
                memberId, new BehaviorAnalysisInputRequest(null, null));
        var snapshot = analysisInputRepository.findById(analysisInput.id()).orElseThrow();
        MarketPersonalizationDecisionWithVersion generated = generateDecision(memberId, analysisInput);
        var saved = persistenceService.save(
                member, snapshot, generated.version(), generated.decision());
        return MarketDifficultyRecommendationResponse.from(saved);
    }

    public MarketDifficultyRecommendationResponse refresh(UUID memberId) {
        return recommend(memberId);
    }

    private MarketPersonalizationDecisionWithVersion generateDecision(
            UUID memberId, BehaviorAnalysisInputResponse input) {
        try {
            String raw = groqChatClient.complete(
                    promptFactory.systemPrompt(), promptFactory.userPrompt(input), 350, 0.2).text();
            MarketAiDifficultyDraft draft = validator.validate(parse(raw));
            var decision = new MarketPersonalizationDecision(
                    draft.recommendedDifficulty(),
                    input.eventCount() == 0 ? "NO_HISTORY" : "FULL_TIMELINE",
                    draft.itemCount(), draft.quantityComplexity(), draft.budgetPressure(),
                    draft.textSupport(), draft.reasonCodes());
            return new MarketPersonalizationDecisionWithVersion(
                    decision, MarketAiDifficultyPromptFactory.PROMPT_VERSION);
        } catch (RuntimeException exception) {
            log.warn("AI 장보기 추천 난이도 생성 실패. 안전 기본값으로 복구합니다. memberId={}, cause={}",
                    memberId, exception.getMessage());
            var decision = new MarketPersonalizationDecision(
                    2, input.eventCount() == 0 ? "NO_HISTORY" : "FULL_TIMELINE",
                    3, "MEDIUM", "MEDIUM", "STANDARD",
                    java.util.List.of("AI_DIFFICULTY_FALLBACK"));
            return new MarketPersonalizationDecisionWithVersion(
                    decision, MarketAiDifficultyPromptFactory.PROMPT_VERSION);
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
