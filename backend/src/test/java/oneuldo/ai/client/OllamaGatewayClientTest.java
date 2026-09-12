package oneuldo.ai.client;

import java.time.Duration;
import oneuldo.ai.config.OllamaConfiguration;
import oneuldo.ai.config.OllamaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OllamaGatewayClientTest {
    @Test void sendsTeamKeyToHttpsGateway() {
        var builder = RestClient.builder().baseUrl("https://ai.example.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var settings = new OllamaProperties("https://ai.example.com", "qwen3.6:27b-q4_K_M", 8192,
                Duration.ofMinutes(30), Duration.ofMinutes(10), 8, "10m", "test-team-key");
        var client = new RestOllamaChatClient(builder.build(), settings);
        server.expect(requestTo("https://ai.example.com/api/chat"))
                .andExpect(header("Authorization", "Bearer test-team-key"))
                .andRespond(withSuccess("{\"done\":true,\"done_reason\":\"stop\",\"message\":{\"content\":\"ok\"}}", MediaType.APPLICATION_JSON));
        assertThat(client.complete("system", "user").text()).isEqualTo("ok");
        assertThat(settings.toString()).doesNotContain("test-team-key");
        server.verify();
    }
    @Test void rejectsPlaintextRemoteCredentials() {
        assertThatThrownBy(() -> new OllamaProperties("http://ai.example.com", "qwen3.6:27b-q4_K_M", 8192,
                Duration.ofMinutes(30), Duration.ZERO, 1, "10m", "test-team-key"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("HTTPS");
    }
    @Test void bindsPropertiesWithAndWithoutOptionalKey() {
        var context = new ApplicationContextRunner().withUserConfiguration(OllamaConfiguration.class)
                .withPropertyValues("spring.profiles.active=ollama", "ai.ollama.base-url=https://ai.example.com",
                        "ai.ollama.model=qwen3.6:27b-q4_K_M", "ai.ollama.context-length=8192", "ai.ollama.timeout=PT30M",
                        "ai.ollama.queue-timeout=PT10M", "ai.ollama.max-queued=8", "ai.ollama.keep-alive=10m");
        context.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean(OllamaProperties.class).apiKey()).isEmpty();
        });
        context.withPropertyValues("ai.ollama.api-key=test-team-key").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean(OllamaProperties.class).apiKey()).isEqualTo("test-team-key");
        });
    }
}
