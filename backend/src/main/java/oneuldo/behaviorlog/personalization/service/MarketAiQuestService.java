package oneuldo.behaviorlog.personalization.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import oneuldo.simulationquest.llm.input.LlmSimulationInputService;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class MarketAiQuestService {

    private static final UUID MARKET_TEMPLATE_ID = UUID.fromString(
            "50000000-0000-0000-0000-000000000003");

    private final LlmSimulationInputService inputService;
    private final MarketAiQuestPromptFactory promptFactory;
    private final MarketAiQuestValidator validator;
    private final MarketDifficultyRecommendationService fallbackRecommendationService;
    private final MarketAiQuestAuditService auditService;
    private final GroqChatClient groqChatClient;
    private final ObjectMapper objectMapper;

    public MarketAiQuestResponse generate(UUID memberId) {
        LlmSimulationGenerationInput input = inputService.build(memberId, MARKET_TEMPLATE_ID);
        MarketDifficultyRecommendationResponse recommendation =
                fallbackRecommendationService.recommend(memberId);
        UUID generationId = UUID.randomUUID();
        List<MarketAiQuestGeneration.Attempt> attempts = new ArrayList<>();
        String model = null;
        long startedAt = System.nanoTime();
        try {
            String userPrompt = promptFactory.userPrompt(input, recommendation);
            GroqChatClient.GroqChatResult result = groqChatClient.complete(
                    promptFactory.systemPrompt(), userPrompt, 900, 0.35);
            model = result.model();
            MarketAiQuestDraft draft;
            try {
                draft = validator.validate(
                        parse(result.text()), recommendation.recommendedDifficulty());
                attempts.add(new MarketAiQuestGeneration.Attempt(1, result.text(), null));
            } catch (IllegalArgumentException firstFailure) {
                attempts.add(new MarketAiQuestGeneration.Attempt(
                        1, result.text(), firstFailure.getMessage()));
                result = groqChatClient.complete(
                        promptFactory.systemPrompt(),
                        userPrompt + "\n이전 출력 검증 실패: " + firstFailure.getMessage()
                                + "\n상품 가격으로 목표 총액을 다시 계산해 제약을 만족하는 JSON만 수정 출력하세요.",
                        900, 0.2);
                model = result.model();
                try {
                    draft = validator.validate(
                            parse(result.text()), recommendation.recommendedDifficulty());
                    attempts.add(new MarketAiQuestGeneration.Attempt(2, result.text(), null));
                } catch (IllegalArgumentException secondFailure) {
                    attempts.add(new MarketAiQuestGeneration.Attempt(
                            2, result.text(), secondFailure.getMessage()));
                    throw secondFailure;
                }
            }
            long latencyMs = elapsedMillis(startedAt);
            MarketAiQuestResponse response = MarketAiQuestResponse.from(
                    generationId, "AI", model, latencyMs,
                    input.generationPlan().personalizationMode().name(),
                    MarketAiQuestPromptFactory.PROMPT_VERSION, draft);
            auditService.record(memberId, response, draft, attempts, null);
            return response;
        } catch (RuntimeException exception) {
            log.warn("AI 장보기 퀘스트 생성 실패. 규칙형 미션으로 복구합니다. memberId={}, cause={}",
                    memberId, exception.getMessage());
            MarketAiQuestDraft fallbackDraft = fallback(memberId);
            MarketAiQuestResponse response = MarketAiQuestResponse.from(
                    generationId, "RULE_FALLBACK", model, elapsedMillis(startedAt),
                    input.generationPlan().personalizationMode().name(),
                    MarketAiQuestPromptFactory.PROMPT_VERSION,
                    fallbackDraft);
            auditService.record(
                    memberId, response, fallbackDraft, attempts, exception.getMessage());
            return response;
        }
    }

    private MarketAiQuestDraft parse(String rawText) {
        if (rawText == null || rawText.isBlank()) throw new IllegalArgumentException("AI 응답이 비었습니다.");
        String text = rawText.trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end < start) throw new IllegalArgumentException("AI 응답에 JSON 객체가 없습니다.");
        try {
            return objectMapper.readValue(text.substring(start, end + 1), MarketAiQuestDraft.class);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("AI 장보기 JSON을 해석할 수 없습니다.", exception);
        }
    }

    private MarketAiQuestDraft fallback(UUID memberId) {
        MarketDifficultyRecommendationResponse recommendation =
                fallbackRecommendationService.recommend(memberId);
        var adjustment = recommendation.adjustments();
        List<String> productIds = List.of("milk", "apple", "curry", "juice")
                .subList(0, adjustment.itemCount());
        int[] quantities = switch (adjustment.quantityComplexity()) {
            case "LOW" -> new int[]{1, 1, 1, 1};
            case "HIGH" -> new int[]{2, 3, 2, 1};
            default -> new int[]{1, 2, 1, 1};
        };
        List<MarketAiQuestDraft.Objective> objectives = java.util.stream.IntStream
                .range(0, productIds.size())
                .mapToObj(index -> new MarketAiQuestDraft.Objective(
                        productIds.get(index), quantities[index]))
                .toList();
        int total = objectives.stream().mapToInt(objective ->
                MarketQuestCatalog.require(objective.productId()).price() * objective.quantity()).sum();
        int margin = switch (adjustment.budgetPressure()) {
            case "LOW" -> 3500;
            case "HIGH" -> 500;
            default -> 2500;
        };
        int budget = ((total + margin + 499) / 500) * 500;
        List<String> briefing = switch (adjustment.textSupport()) {
            case "SIMPLIFIED" -> List.of(
                    "목록에 있는 물건을 필요한 수만큼 담아요.",
                    "모두 담은 뒤 계산대로 가요.");
            case "REDUCED" -> List.of("목록과 예산을 확인하고 장보기를 시작해요.");
            default -> List.of(
                    "오늘 필요한 물건을 목록에 맞게 골라요.",
                    "목록과 남은 예산은 화면 위에서 확인할 수 있어요.");
        };
        return new MarketAiQuestDraft(
                recommendation.recommendedDifficulty(), "오늘의 맞춤 장보기",
                "목록에 있는 물건을 필요한 수만큼 예산 안에서 골라요.", budget,
                objectives, briefing,
                List.of("목록과 장바구니를 같이 확인해 볼게요.",
                        "필요한 물건과 예산을 모두 지켰는지 살펴봐요."),
                "맞춤 장보기를 마쳤어요!",
                "AI 생성 실패로 검증된 규칙형 개인화 미션을 적용했습니다.",
                List.of("AI_GENERATION_FALLBACK"));
    }

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000L;
    }
}
