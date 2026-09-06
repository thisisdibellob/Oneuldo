package oneuldo.behaviorlog.analysis.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Technical transport limits only; never interprets behavior or changes observations. */
@Component
public class AnalysisTokenBudget {
    @Value("${ai.behavior-analysis.request-token-budget:7000}")
    private int requestTokens = 7000;
    @Value("${ai.behavior-analysis.chunk-output-tokens:900}")
    private int chunkOutputTokens = 900;
    @Value("${ai.behavior-analysis.final-output-tokens:1200}")
    private int finalOutputTokens = 1200;
    @Value("${ai.groq.model:qwen/qwen3.6-27b}")
    private String model = "qwen/qwen3.6-27b";
    public int requestTokens() { return requestTokens; }
    public int chunkOutputTokens() { return chunkOutputTokens; }
    public int finalOutputTokens() { return finalOutputTokens; }
    public int total(String system, String user) {
        return total(system, user, finalOutputTokens);
    }
    public int total(String system, String user, int reservedOutput) {
        if (!"qwen/qwen3.6-27b".equals(model)) throw new IllegalArgumentException("TOKENIZER_MODEL_MISMATCH");
        if (reservedOutput < 1 || requestTokens <= reservedOutput) throw new IllegalArgumentException("INVALID_TOKEN_BUDGET");
        return Math.addExact(QwenTokenCounter.inputTokens(system, user), reservedOutput);
    }
    public void requireFits(String system, String user, int limit, String reason) {
        int total = total(system, user);
        if (total > limit) throw new IllegalArgumentException(reason + ": required=" + total + ", limit=" + limit);
    }
    public void requireFits(String system, String user, int output, int limit, String reason) {
        int total = total(system, user, output);
        if (total > limit) throw new IllegalArgumentException(reason + ": required=" + total + ", limit=" + limit);
    }
}
