package oneuldo.gateway;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("gateway")
public record GatewaySettings(URI upstream, Duration timeout, Duration queueTimeout,
        int maxQueued, Map<String, String> apiKeyHashes) {
    public GatewaySettings {
        if (upstream == null || !"http".equals(upstream.getScheme())
                || !"127.0.0.1".equals(upstream.getHost()) || upstream.getPort() < 1) {
            throw new IllegalArgumentException("Gateway upstream must be local Ollama");
        }
        if (timeout == null || timeout.isNegative() || timeout.isZero()
                || queueTimeout == null || queueTimeout.isNegative() || maxQueued < 0 || maxQueued > 32) {
            throw new IllegalArgumentException("Invalid gateway limits");
        }
        if (apiKeyHashes == null || apiKeyHashes.isEmpty()
                || apiKeyHashes.entrySet().stream().anyMatch(e -> !e.getKey().matches("[a-z0-9-]{1,40}")
                || e.getValue() == null || !e.getValue().matches("[a-fA-F0-9]{64}"))) {
            throw new IllegalArgumentException("Configure at least one team API key SHA-256 hash");
        }
        apiKeyHashes = Map.copyOf(apiKeyHashes);
    }
}
