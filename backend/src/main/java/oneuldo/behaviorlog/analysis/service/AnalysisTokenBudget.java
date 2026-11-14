package oneuldo.behaviorlog.analysis.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Technical transport limits only; never interprets behavior or changes observations. */
@Component
public class AnalysisTokenBudget {
    private int transportLimit = Integer.MAX_VALUE;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void constrainTransport(oneuldo.ai.config.OllamaProperties properties) {
        transportLimit = properties.contextLength() - 256;
    }
    @Value("${ai.behavior-analysis.request-token-budget:7000}")
    private int requestTokens = 7000;
    @Value("${ai.behavior-analysis.chunk-output-tokens:900}")
    private int chunkOutputTokens = 900;
    @Value("${ai.behavior-analysis.final-output-tokens:900}")
    private int finalOutputTokens = 900;
    @Value("${ai.model:${ai.groq.model:qwen/qwen3.6-27b}}")
    private String model = "qwen/qwen3.6-27b";
    public int requestTokens() { return Math.min(requestTokens, transportLimit); }
    public int chunkOutputTokens() { return chunkOutputTokens; }
    public int finalOutputTokens() { return finalOutputTokens; }
    public int total(String system, String user) {
        return total(system, user, finalOutputTokens);
    }
    public int total(String system, String user, int reservedOutput) {
        if (!"qwen/qwen3.6-27b".equals(model) && !"qwen3.6:27b-q4_K_M".equals(model)) throw new IllegalArgumentException("TOKENIZER_MODEL_MISMATCH");
        if (reservedOutput < 1 || requestTokens <= reservedOutput) throw new IllegalArgumentException("INVALID_TOKEN_BUDGET");
        return Math.addExact(QwenTokenCounter.inputTokens(system, user), reservedOutput);
    }
    public void requireFits(String system, String user, int limit, String reason) {
        int total = total(system, user);
        int effective = Math.min(limit, transportLimit);
        if (total > effective) throw new oneuldo.ai.exception.AiInputLimitException(reason, total, effective);
    }
    public void requireFits(String system, String user, int output, int limit, String reason) {
        int total = total(system, user, output);
        int effective = Math.min(limit, transportLimit);
        if (total > effective) throw new oneuldo.ai.exception.AiInputLimitException(reason, total, effective);
    }
}
