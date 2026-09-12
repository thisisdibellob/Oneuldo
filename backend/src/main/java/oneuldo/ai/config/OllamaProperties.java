package oneuldo.ai.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ai.ollama")
public record OllamaProperties(String baseUrl, String model, int contextLength,
        Duration timeout, Duration queueTimeout, int maxQueued, String keepAlive, String apiKey) {
    public OllamaProperties(String baseUrl, String model, int contextLength,
            Duration timeout, Duration queueTimeout, int maxQueued, String keepAlive) {
        this(baseUrl, model, contextLength, timeout, queueTimeout, maxQueued, keepAlive, "");
    }
    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public OllamaProperties {
        apiKey = apiKey == null ? "" : apiKey;
        var uri = java.net.URI.create(baseUrl);
        if (!apiKey.isBlank() && !"https".equals(uri.getScheme())
                && !("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()))) {
            throw new IllegalArgumentException("Remote API keys require HTTPS");
        }
        if (!"qwen3.6:27b-q4_K_M".equals(model)) {
            throw new IllegalArgumentException("TOKENIZER_MODEL_MISMATCH: unsupported Ollama model");
        }
        if (contextLength < 1024 || timeout == null || timeout.isNegative() || timeout.isZero()
                || queueTimeout == null || queueTimeout.isNegative() || maxQueued < 0 || maxQueued > 100) {
            throw new IllegalArgumentException("Invalid Ollama context, timeout or queue settings");
        }
    }
    @Override public String toString() {
        return "OllamaProperties[model=" + model + ", contextLength=" + contextLength + ", apiKey=REDACTED]";
    }
}
