package oneuldo.behaviorlog.personalization.service;

import java.util.LinkedHashMap;
import java.util.Map;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class MarketAiDifficultyPromptFactory {

    public static final String PROMPT_VERSION = "market-ai-difficulty-v1";
    private final ObjectMapper objectMapper;

    public MarketAiDifficultyPromptFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String systemPrompt() {
        return "아동용 장보기 퀘스트의 맞춤 난이도를 판단합니다. 제공된 게임 행동 프로파일만 사용하세요. "
                + "의학적 진단, IQ, 장애 정도나 실제 생활 전체의 능력을 추정하지 마세요. "
                + "근거가 부족하다는 사실도 판단에 반영하고 JSON 객체 하나만 출력하세요.";
    }

    public String userPrompt(LlmSimulationGenerationInput input) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("promptVersion", PROMPT_VERSION);
        context.put("personalizationMode", input.generationPlan().personalizationMode());
        context.put("preferences", input.preferences());
        context.put("behaviorProfile", input.profile());
        context.put("difficultyMeaning", Map.of(
                "1", "품목과 수량을 단순화하고 안내를 충분히 제공",
                "2", "현재 수행을 안정적으로 관찰하고 연습",
                "3", "품목·수량·예산 판단의 독립 수행 범위를 확대"
        ));
        context.put("constraints", Map.of(
                "recommendedDifficulty", "1~3 중 하나",
                "itemCount", "2~4",
                "quantityComplexity", "LOW, MEDIUM, HIGH 중 하나",
                "budgetPressure", "LOW, MEDIUM, HIGH 중 하나",
                "textSupport", "SIMPLIFIED, STANDARD, REDUCED 중 하나",
                "insufficientEvidence", "근거가 부족하면 단정하지 말고 관찰 가능한 난이도 2를 우선 고려",
                "reasonCodes", "2~50자의 영문 대문자·숫자·밑줄 코드 1~8개"
        ));
        context.put("outputSchema", Map.of(
                "recommendedDifficulty", 2,
                "itemCount", 3,
                "quantityComplexity", "MEDIUM",
                "budgetPressure", "MEDIUM",
                "textSupport", "STANDARD",
                "reasonCodes", new String[]{"PROFILE_EVIDENCE_REVIEWED"}
        ));
        try {
            return objectMapper.writeValueAsString(context);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("AI 장보기 난이도 입력을 직렬화할 수 없습니다.", exception);
        }
    }
}
