package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.UUID;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.PersonalizationMode;
import oneuldo.simulationquest.llm.input.LlmSimulationInputService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class MarketAiQuestServiceTest {

    private final LlmSimulationInputService inputService = mock(LlmSimulationInputService.class);
    private final MarketAiQuestPromptFactory promptFactory = mock(MarketAiQuestPromptFactory.class);
    private final MarketDifficultyRecommendationService fallbackService =
            mock(MarketDifficultyRecommendationService.class);
    private final MarketAiQuestAuditService auditService = mock(MarketAiQuestAuditService.class);
    private final GroqChatClient groqChatClient = mock(GroqChatClient.class);
    private final UUID memberId = UUID.randomUUID();
    private MarketDifficultyRecommendationResponse recommendation;
    private MarketAiQuestService service;

    @BeforeEach
    void setUp() {
        var input = mock(LlmSimulationGenerationInput.class);
        var plan = mock(LlmSimulationGenerationInput.GenerationPlan.class);
        when(input.generationPlan()).thenReturn(plan);
        when(plan.personalizationMode()).thenReturn(PersonalizationMode.BEHAVIOR_INFORMED);
        when(inputService.build(eq(memberId), eq(UUID.fromString(
                "50000000-0000-0000-0000-000000000003")))).thenReturn(input);
        recommendation = recommendation(1);
        when(fallbackService.recommend(memberId)).thenReturn(recommendation);
        when(promptFactory.systemPrompt()).thenReturn("system");
        when(promptFactory.userPrompt(input, recommendation)).thenReturn("user");
        service = new MarketAiQuestService(
                inputService, promptFactory, new MarketAiQuestValidator(), fallbackService,
                auditService,
                groqChatClient, new ObjectMapper());
    }

    @Test
    void 행동_프로파일을_사용한_AI_JSON을_검증해_퀘스트로_반환한다() {
        when(groqChatClient.complete("system", "user", 900, 0.35)).thenReturn(
                new GroqChatClient.GroqChatResult("""
                        {"difficulty":1,"title":"수량을 확인하는 장보기",
                        "description":"두 물건을 하나씩 담아요.","budget":5000,
                        "objectives":[{"productId":"milk","quantity":1},{"productId":"apple","quantity":1}],
                        "briefing":["목록을 보고 하나씩 담아요."],
                        "checkoutDialogue":["목록을 확인해요.","예산도 확인해요."],
                        "successMessage":"장보기를 마쳤어요!",
                        "adaptationSummary":"수량 수행 근거를 반영해 품목과 수량을 단순화했습니다.",
                        "reasonCodes":["NUMERACY_SUPPORT"]}
                        """, "qwen-test"));

        var response = service.generate(memberId);

        assertThat(response.source()).isEqualTo("AI");
        assertThat(response.model()).isEqualTo("qwen-test");
        assertThat(response.quest().difficulty()).isEqualTo(1);
        assertThat(response.quest().objectives()).hasSize(2);
        assertThat(response.personalizationMode()).isEqualTo("BEHAVIOR_INFORMED");
        verify(auditService).record(
                eq(memberId), eq(response), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.argThat(attempts -> attempts.size() == 1
                        && attempts.getFirst().failureReason() == null), eq(null));
    }

    @Test
    void AI가_허용되지_않은_상품을_만들면_규칙형_미션으로_복구한다() {
        when(groqChatClient.complete(anyString(), anyString(), eq(900), anyDouble())).thenReturn(
                new GroqChatClient.GroqChatResult("""
                        {"difficulty":2,"title":"잘못된 장보기","description":"설명","budget":5000,
                        "objectives":[{"productId":"unknown","quantity":1},{"productId":"apple","quantity":1}],
                        "briefing":["안내"],"checkoutDialogue":["확인","계산"],
                        "successMessage":"완료","adaptationSummary":"요약","reasonCodes":["TEST"]}
                        """, "qwen-test"));
        recommendation = recommendation(2);
        when(fallbackService.recommend(memberId)).thenReturn(recommendation);
        when(promptFactory.userPrompt(org.mockito.ArgumentMatchers.any(), eq(recommendation)))
                .thenReturn("user");

        var response = service.generate(memberId);

        assertThat(response.source()).isEqualTo("RULE_FALLBACK");
        assertThat(response.quest().difficulty()).isEqualTo(2);
        assertThat(response.reasonCodes()).containsExactly("AI_GENERATION_FALLBACK");
        verify(auditService).record(
                eq(memberId), eq(response), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.argThat(attempts -> attempts.size() == 2),
                org.mockito.ArgumentMatchers.contains("허용되지 않은 상품"));
    }

    private MarketDifficultyRecommendationResponse recommendation(int difficulty) {
        return new MarketDifficultyRecommendationResponse(
                UUID.randomUUID(), null, "MARKET_SIMULATION", difficulty,
                "INSUFFICIENT_EVIDENCE",
                new MarketDifficultyRecommendationResponse.Adjustments(
                        3, "MEDIUM", "MEDIUM", "STANDARD"),
                List.of("AI_RECOMMENDATION"), "market-ai-difficulty-v1",
                java.time.Instant.now());
    }
}
