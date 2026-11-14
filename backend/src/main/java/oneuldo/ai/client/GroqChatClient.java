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

    default int maxConcurrency() { return 1; }
    default boolean supportsSourceSchemas() { return false; }
    default boolean supportsGroundedCauseEnums() { return false; }
    default boolean supportsGroundedTextPatchSchemas() { return false; }
    default boolean supportsCitationPoolSchemas() { return false; }
    default boolean supportsCompactSourceSchemas() { return false; }
    default boolean supportsConcretePracticeSchemas() { return false; }
    default GroqChatResult completeStructured(String system,String prompt,int output,double temperature,Object schema) {
        return complete(system,prompt,output,temperature);
    }

    record GroqChatResult(String text, String model, String finishReason, Integer inputTokens, Integer outputTokens, Long latencyMs) {
        public GroqChatResult(String text,String model) {this(text,model,null,null,null,null);}
    }
}
