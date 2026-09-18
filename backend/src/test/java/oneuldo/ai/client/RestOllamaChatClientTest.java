package oneuldo.ai.client;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.ai.exception.CloudAiUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RestOllamaChatClientTest {
    private static final String RESPONSE = """
            {"model":"qwen3.6:27b-q4_K_M","message":{"role":"assistant","content":"결과"},
            "done":true,"done_reason":"stop","prompt_eval_count":101,"eval_count":169}
            """;

    private OllamaProperties properties(int queued, Duration wait) {
        return new OllamaProperties("http://localhost:11435", "qwen3.6:27b-q4_K_M", 8192,
                Duration.ofMinutes(15), wait, queued, "10m");
    }

    @Test void sendsNativeNonThinkingRequestAndMapsUsage() {
        var builder = RestClient.builder().baseUrl("http://localhost:11435");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new RestOllamaChatClient(builder.build(), properties(8, Duration.ofMinutes(10)));
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andExpect(headerDoesNotExist("Authorization"))
                .andExpect(content().json("""
                        {"model":"qwen3.6:27b-q4_K_M",
                         "messages":[{"role":"system","content":"시스템"},{"role":"user","content":"사용자"}],
                         "think":false,"stream":false,"keep_alive":"10m",
                         "options":{"num_ctx":8192,"num_predict":900,"temperature":0.2,"top_p":0.8}}
                        """, true))
                .andRespond(withSuccess(RESPONSE, MediaType.APPLICATION_JSON));
        var result = client.complete("시스템", "사용자", 900, 0.2);
        assertThat(result.text()).isEqualTo("결과");
        assertThat(result.model()).isEqualTo("qwen3.6:27b-q4_K_M");
        assertThat(result.finishReason()).isEqualTo("stop");
        assertThat(result.inputTokens()).isEqualTo(101);
        assertThat(result.outputTokens()).isEqualTo(169);
        server.verify();
    }

    @Test void digestUsesNamedSchemaButOrdinaryRequestsRemainUnconstrained() {
        var builder=RestClient.builder().baseUrl("http://localhost:11435");
        var server=MockRestServiceServer.bindTo(builder).build();
        var client=new RestOllamaChatClient(builder.build(),properties(0,Duration.ZERO));
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andExpect(jsonPath("$.format.properties.observations.items.properties.evidenceEventIds.items.pattern").value("^E[1-9][0-9]*$"))
                .andExpect(jsonPath("$.format.additionalProperties").value(false))
                .andRespond(withSuccess(RESPONSE,MediaType.APPLICATION_JSON));
        client.completeDigest("s","u",1800,0.2);
        server.verify();
    }
    @Test void preservesLengthSoAnalysisCanSplitTruncatedOutput() {
        var builder = RestClient.builder().baseUrl("http://localhost:11435");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andRespond(withSuccess(RESPONSE.replace("\"stop\"", "\"length\""), MediaType.APPLICATION_JSON));
        var client = new RestOllamaChatClient(builder.build(), properties(8, Duration.ZERO));
        assertThat(client.complete("s", "u").finishReason()).isEqualTo("length");
        server.verify();
    }

    @Test void rejectsOversizedInputBeforeHttpAndDoesNotLoseQueueCapacity() {
        var builder = RestClient.builder().baseUrl("http://localhost:11435");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new RestOllamaChatClient(builder.build(), properties(0, Duration.ZERO));
        assertThatThrownBy(() -> client.complete("s", "word ".repeat(10000), 900, 0.2))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("OLLAMA_CONTEXT_LIMIT_EXCEEDED");
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andRespond(withSuccess(RESPONSE, MediaType.APPLICATION_JSON));
        assertThat(client.complete("s", "u").text()).isEqualTo("결과");
        server.verify();
    }

    @Test void errorsDoNotRetryOrFallBackAndReleaseCapacity() {
        var builder = RestClient.builder().baseUrl("http://localhost:11435");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://localhost:11435/api/chat")).andRespond(withServerError());
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andRespond(withSuccess("{\"error\":\"model unavailable\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://localhost:11435/api/chat"))
                .andRespond(withSuccess(RESPONSE, MediaType.APPLICATION_JSON));
        var client = new RestOllamaChatClient(builder.build(), properties(0, Duration.ZERO));
        assertThatThrownBy(() -> client.complete("s", "u")).isInstanceOf(CloudAiUnavailableException.class);
        assertThatThrownBy(() -> client.complete("s", "u")).isInstanceOf(CloudAiUnavailableException.class);
        assertThat(client.complete("s", "u").text()).isEqualTo("결과");
        server.verify();
    }

    @Test void serializesCallsAndRejectsFullOrExpiredQueue() throws Exception {
        for (int queued : new int[]{0, 1}) {
            var builder = RestClient.builder().baseUrl("http://localhost:11435");
            var server = MockRestServiceServer.bindTo(builder).build();
            var entered = new CountDownLatch(1);
            var release = new CountDownLatch(1);
            server.expect(requestTo("http://localhost:11435/api/chat")).andRespond(request -> {
                entered.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("test did not release response");
                } catch (InterruptedException e) { throw new AssertionError(e); }
                return withSuccess(RESPONSE, MediaType.APPLICATION_JSON).createResponse(request);
            });
            server.expect(requestTo("http://localhost:11435/api/chat"))
                    .andRespond(withSuccess(RESPONSE, MediaType.APPLICATION_JSON));
            var client = new RestOllamaChatClient(builder.build(), properties(queued, Duration.ZERO));
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var first = executor.submit(() -> client.complete("s", "first"));
                try {
                    assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> client.complete("s", "second"))
                            .isInstanceOf(CloudAiUnavailableException.class)
                            .hasMessage(queued == 0 ? "AI_QUEUE_FULL" : "AI_QUEUE_TIMEOUT");
                } finally { release.countDown(); }
                assertThat(first.get(5, TimeUnit.SECONDS).text()).isEqualTo("결과");
                assertThat(client.complete("s", "third").text()).isEqualTo("결과");
            }
            server.verify();
        }
    }
}
