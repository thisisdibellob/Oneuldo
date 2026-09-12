package oneuldo.ai.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@Profile("ollama")
@EnableConfigurationProperties(OllamaProperties.class)
public class OllamaConfiguration {
    @Bean("ollamaRestClient")
    RestClient ollamaRestClient(OllamaProperties properties) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(properties.timeout());
        return RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(factory).build();
    }
}
