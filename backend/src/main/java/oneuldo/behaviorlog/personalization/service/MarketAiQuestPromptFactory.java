package oneuldo.behaviorlog.personalization.service;

import java.util.LinkedHashMap;
import java.util.Map;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class MarketAiQuestPromptFactory {

    public static final String PROMPT_VERSION = "market-ai-quest-v1";
    private final ObjectMapper objectMapper;

    public MarketAiQuestPromptFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String systemPrompt() {
        return "아동용 생활기술 퀘스트 설계자입니다. 제공된 게임 행동 근거만으로 다음 장보기 퀘스트를 조정하세요. "
                + "의학적 진단, IQ, 장애 정도를 추정하지 말고 사용자의 개인정보나 상태를 퀘스트 문장에 노출하지 마세요. "
                + "허용된 상품과 가격만 사용하고 반드시 JSON 하나만 출력하세요.";
    }

    public String userPrompt(LlmSimulationGenerationInput input,
            MarketDifficultyRecommendationResponse recommendation) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("promptVersion", PROMPT_VERSION);
        context.put("goal", input.quest().goal());
        context.put("preferences", input.preferences());
        context.put("behaviorProfile", input.profile());
        context.put("aiDifficultyRecommendation", recommendation);
        context.put("availableProducts", MarketQuestCatalog.PRODUCTS);
        context.put("constraints", Map.of(
                "difficulty", "aiDifficultyRecommendation.recommendedDifficulty와 정확히 같은 값",
                "objectiveCount", "2~4개",
                "quantity", "각 1~3개",
                "budget", "목표 총액 이상, 목표 총액+4000원 이하",
                "briefing", "1~3문장, 각 80자 이하",
                "checkoutDialogue", "정확히 2문장, 각 80자 이하",
                "assessmentRule", "근거가 부족하면 난이도 2의 관찰 가능한 과제를 생성",
                "safetyRule", "시간 압박, 위험 행동, 실제 결제를 만들지 않음"
        ));
        context.put("outputSchema", Map.of(
                "difficulty", 2,
                "title", "문자열",
                "description", "문자열",
                "budget", 5000,
                "objectives", new Object[]{
                        Map.of("productId", "milk", "quantity", 1),
                        Map.of("productId", "apple", "quantity", 1)},
                "briefing", new String[]{"문장"},
                "checkoutDialogue", new String[]{"문장1", "문장2"},
                "successMessage", "문자열",
                "adaptationSummary", "행동 근거와 조정의 관계를 100자 이하로 요약",
                "reasonCodes", new String[]{"짧은_영문_대문자_코드"}
        ));
        try {
            return objectMapper.writeValueAsString(context);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("AI 장보기 입력을 직렬화할 수 없습니다.", exception);
        }
    }
}
