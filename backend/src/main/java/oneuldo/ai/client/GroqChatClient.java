package oneuldo.ai.client;

public interface GroqChatClient {

    GroqChatResult complete(String systemPrompt, String userPrompt);

    default GroqChatResult complete(String systemPrompt, String userPrompt,
            int maxCompletionTokens, double temperature) {
        return complete(systemPrompt, userPrompt);
    }

    default GroqChatResult completeDigest(String systemPrompt, String userPrompt,
            int maxCompletionTokens, double temperature) {
        return complete(systemPrompt, userPrompt, maxCompletionTokens, temperature);
    }

    record GroqChatResult(String text, String model, String finishReason, Integer inputTokens, Integer outputTokens, Long latencyMs) {
        public GroqChatResult(String text,String model) {this(text,model,null,null,null,null);}
    }
}
