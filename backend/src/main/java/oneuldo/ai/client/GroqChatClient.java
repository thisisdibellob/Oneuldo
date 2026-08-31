package oneuldo.ai.client;

public interface GroqChatClient {

    GroqChatResult complete(String systemPrompt, String userPrompt);

    default GroqChatResult complete(String systemPrompt, String userPrompt,
            int maxCompletionTokens, double temperature) {
        return complete(systemPrompt, userPrompt);
    }

    record GroqChatResult(String text, String model) {
    }
}
