package oneuldo.ai.client;

import java.time.Duration;
import oneuldo.ai.config.GroqProperties;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.service.AnalysisCallPacer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

class AiProviderSelectionTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(RestGroqChatClient.class, RestOllamaChatClient.class)
            .withBean("groqRestClient", RestClient.class, () -> RestClient.create("https://api.groq.com"))
            .withBean("ollamaRestClient", RestClient.class, () -> RestClient.create("http://localhost:11435"))
            .withBean(GroqProperties.class, () -> new GroqProperties(true, "test-key", "https://api.groq.com",
                    "qwen/qwen3.6-27b", Duration.ofSeconds(20)))
            .withBean(OllamaProperties.class, () -> new OllamaProperties("http://localhost:11435",
                    "qwen3.6:27b-q4_K_M", 8192, Duration.ofMinutes(15), Duration.ofMinutes(10), 8, "10m"))
            .withBean(AnalysisCallPacer.class, AnalysisCallPacer::new);

    @Test void defaultsToExistingGroqClient() {
        context.run(ctx -> assertThat(ctx).hasSingleBean(GroqChatClient.class)
                .hasSingleBean(RestGroqChatClient.class).doesNotHaveBean(RestOllamaChatClient.class));
    }

    @Test void ollamaProfileSelectsOnlyLocalClientEvenWithGroqKeyPresent() {
        context.withPropertyValues("spring.profiles.active=ollama").run(ctx -> assertThat(ctx)
                .hasSingleBean(GroqChatClient.class).hasSingleBean(RestOllamaChatClient.class)
                .doesNotHaveBean(RestGroqChatClient.class));
    }
}
