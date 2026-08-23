package oneuldo.ai.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ai.groq")
public record GroqProperties(
        boolean enabled,
        String apiKey,
        String baseUrl,
        String model,
        Duration timeout
) {
    public boolean available() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }
}
