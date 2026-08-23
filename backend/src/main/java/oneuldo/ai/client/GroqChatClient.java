package oneuldo.ai.client;

public interface GroqChatClient {

    GroqChatResult complete(String systemPrompt, String userPrompt);

    record GroqChatResult(String text, String model) {
    }
}
