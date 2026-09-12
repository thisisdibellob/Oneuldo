package oneuldo.ai.client;

import java.net.http.HttpClient;
import java.time.Duration;
import oneuldo.ai.config.OllamaProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.assertThat;

/** Explicit opt-in; sends only synthetic text, without DB access or cloud credentials. */
@EnabledIfEnvironmentVariable(named = "OLLAMA_LIVE_SMOKE", matches = "true")
class OllamaLiveSmokeTest {
    @Test void answersThroughTheApplicationClient() {
        String url = System.getenv().getOrDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11435");
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofMinutes(15));
        var client = new RestOllamaChatClient(RestClient.builder().baseUrl(url).requestFactory(factory).build(),
                new OllamaProperties(url, "qwen3.6:27b-q4_K_M", 8192,
                        Duration.ofMinutes(15), Duration.ofMinutes(10), 8, "10m",
                        System.getenv().getOrDefault("OLLAMA_API_KEY", "")));
        var result = client.complete("주어진 기록에서 관찰된 사실만 한국어 한 문장으로 답하세요.",
                "합성 테스트 기록: 사용자가 장보기 목록을 열고 우유 수량을 2개에서 1개로 수정했다. 무엇을 수정했나요?", 128, 0.2);
        assertThat(result.model()).isEqualTo("qwen3.6:27b-q4_K_M");
        assertThat(result.text()).contains("우유", "1");
        assertThat(result.finishReason()).isEqualTo("stop");
        assertThat(result.inputTokens()).isPositive();
        assertThat(result.outputTokens()).isPositive().isLessThanOrEqualTo(128);
        System.out.println("OLLAMA_SMOKE model=" + result.model() + " input=" + result.inputTokens()
                + " output=" + result.outputTokens() + " latencyMs=" + result.latencyMs()
                + " text=" + result.text());
    }
}
