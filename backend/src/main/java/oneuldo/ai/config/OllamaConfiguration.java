package oneuldo.ai.config;

import java.net.http.HttpClient;
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
    RestClient ollamaRestClient(OllamaProperties properties,
            @org.springframework.beans.factory.annotation.Value("${ai.behavior-analysis.request-token-budget:7800}") int requestBudget) {
        if (requestBudget < 1 || (long)requestBudget + 32 > properties.contextLength() - 256L) {
            throw new IllegalArgumentException("OLLAMA_ANALYSIS_BUDGET_MISMATCH: configure context/request budget together; "
                    + "school=18432/18000, laptop=8192/7800");
        }
        org.slf4j.LoggerFactory.getLogger(OllamaConfiguration.class).info(
                "Ollama analysis settings: contextLength={}, requestTokenBudget={}",properties.contextLength(),requestBudget);
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(properties.connectTimeout()).build());
        factory.setReadTimeout(properties.timeout());
        return RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(factory).build();
    }
}
