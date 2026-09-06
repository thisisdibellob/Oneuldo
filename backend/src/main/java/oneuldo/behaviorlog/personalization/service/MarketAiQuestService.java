package oneuldo.behaviorlog.personalization.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.personalization.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class MarketAiQuestService {
    private final MarketAiQuestPromptFactory promptFactory;
    private final MarketAiQuestValidator validator;
    private final MarketDifficultyRecommendationService recommendationService;
    private final MarketAiQuestAuditService auditService;
    private final oneuldo.behaviorlog.profile.service.AiUserProfileService profileService;
    private final GroqChatClient groqChatClient;
    private final ObjectMapper objectMapper;
    private final oneuldo.ai.service.SingleFlight<UUID,MarketAiQuestResponse> activeRequests=new oneuldo.ai.service.SingleFlight<>();
    @org.springframework.beans.factory.annotation.Value("${ai.groq.model:qwen/qwen3.6-27b}")
    private String configuredModel="qwen/qwen3.6-27b";

    public MarketAiQuestResponse generate(UUID memberId) {
        return activeRequests.run(memberId,()->generateOnce(memberId));
    }

    private MarketAiQuestResponse generateOnce(UUID memberId) {
        var recommendation = recommendationService.recommend(memberId);
        var profile = profileService.find(memberId, recommendation.profileId());
        var analysis = profile.asAnalysisResponse();
        UUID generationId = UUID.randomUUID();
        List<MarketAiQuestGeneration.Attempt> attempts = new ArrayList<>();
        String model = null;
        long startedAt = System.nanoTime();
        MarketAiQuestDraft draft = null;
        String userPrompt = promptFactory.userPrompt(analysis, recommendation);
        // Recommendation IDs/times change on every read; only its AI plan/settings affect generation.
        var semanticPrompt=(tools.jackson.databind.node.ObjectNode)new oneuldo.behaviorlog.analysis.service.LosslessTables(objectMapper).decode(objectMapper.readTree(userPrompt));
        if(semanticPrompt.path("aiDifficultyRecommendation") instanceof tools.jackson.databind.node.ObjectNode rec)
            rec.remove(List.of("recommendationId","profileId","generatedAt"));
        if(semanticPrompt.path("aiUserAnalysis") instanceof tools.jackson.databind.node.ObjectNode record)
            record.remove(List.of("createdAt","latencyMs"));
        String requestKey=oneuldo.ai.service.AiRequestFingerprint.of(objectMapper,memberId,configuredModel,promptFactory.systemPrompt(),semanticPrompt,900,0.2,"quest-reuse-v1");
        var reusable=auditService.findReusable(memberId,requestKey);
        if(reusable.isPresent()) return reusable.get();
        for (int number = 1; number <= 2; number++) {
            GroqChatClient.GroqChatResult result;
            try {
                result = groqChatClient.complete(promptFactory.systemPrompt(), userPrompt + (number == 2
                        ? "\n이전 응답이 구조/상품/가격 검사를 통과하지 못했습니다. 제약을 다시 확인하고 JSON만 출력하세요." : ""), 900, 0.2);
                model = result.model();
            } catch (RuntimeException unavailable) {
                attempts.add(new MarketAiQuestGeneration.Attempt(number, null, "AI_UNAVAILABLE"));
                break;
            }
            try {
                draft = validator.validate(objectMapper.readValue(result.text(), MarketAiQuestDraft.class),
                        recommendation.recommendedDifficulty());
                if (draft.objectives().size() != recommendation.adjustments().itemCount()) {
                    throw new IllegalArgumentException("AI_PLAN_ITEM_COUNT_MISMATCH");
                }
                attempts.add(new MarketAiQuestGeneration.Attempt(number, result.text(), null));
                break;
            } catch (RuntimeException invalid) {
                draft = null;
                attempts.add(new MarketAiQuestGeneration.Attempt(number, result.text(), "INVALID_AI_QUEST"));
            }
        }
        long latency = (System.nanoTime() - startedAt) / 1_000_000L;
        if (draft == null) {
            var failed = new MarketAiQuestResponse(generationId, analysis.analysisId(), profile.profileId(), "FAILED", model, latency,
                    recommendation.personalizationMode(), MarketAiQuestPromptFactory.PROMPT_VERSION,
                    null, null, List.of());
            auditService.record(memberId, recommendation.analysisInputSnapshotId(), failed, null, attempts, "AI_QUEST_FAILED",requestKey);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI 퀘스트 생성 실패. 대체 판정이나 미션을 만들지 않았습니다.");
        }
        var response = MarketAiQuestResponse.from(generationId, analysis.analysisId(), profile.profileId(), "AI", model, latency,
                recommendation.personalizationMode(), MarketAiQuestPromptFactory.PROMPT_VERSION, draft);
        auditService.record(memberId, recommendation.analysisInputSnapshotId(), response, draft, attempts, null,requestKey);
        return response;
    }
}
