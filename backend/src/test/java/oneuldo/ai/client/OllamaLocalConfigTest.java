package oneuldo.ai.client;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import oneuldo.ai.config.OllamaConfiguration;
import oneuldo.ai.config.OllamaProperties;
import static org.assertj.core.api.Assertions.assertThat;

class OllamaLocalConfigTest {
    @TempDir Path directory;
    @Test void localCredentialsOverrideProfileDefaults() throws Exception {
        Path local = directory.resolve("local.properties");
        Files.writeString(local, "ai.ollama.base-url=https://ai.example.com\nai.ollama.api-key=test-local-key\nai.ollama.timeout=PT30M\n");
        String imports = "optional:" + local.toUri();
        Files.writeString(directory.resolve("application.properties"), "spring.config.import=" + imports + "\n");
        String profile = Files.readString(Path.of("src/main/resources/application-ollama.properties"));
        Files.writeString(directory.resolve("application-ollama.properties"), profile);
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(OllamaConfiguration.class)
                .withPropertyValues("spring.profiles.active=ollama", "spring.config.location=" + directory.toUri(), "spring.config.additional-location=" + local.toUri())
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var properties = context.getBean(OllamaProperties.class);
                    assertThat(properties.baseUrl()).isEqualTo("https://ai.example.com");
                    assertThat(properties.apiKey()).isEqualTo("test-local-key");
                    assertThat(properties.timeout()).isEqualTo(Duration.ofMinutes(30));
                    assertThat(context.getEnvironment().getProperty("ai.behavior-analysis.chunk-output-tokens", Integer.class)).isEqualTo(1800);
                    assertThat(context.getEnvironment().getProperty("ai.behavior-analysis.final-output-tokens", Integer.class)).isEqualTo(1800);
                    int requestBudget = context.getEnvironment().getProperty("ai.behavior-analysis.request-token-budget", Integer.class);
                    assertThat(requestBudget).isEqualTo(7800);
                    assertThat(requestBudget + 32).isLessThanOrEqualTo(properties.contextLength() - 256);
                });
    }
}
