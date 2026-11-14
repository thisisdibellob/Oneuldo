package oneuldo.gateway;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicInteger;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class GatewayHttpTest {
    static final String KEY = "integration-test-key-00000000000000000000";
    static final AtomicInteger count = new AtomicInteger();
    static final AtomicInteger status = new AtomicInteger(200);
    static volatile JsonNode received;
    static volatile String upstreamAuthorization;
    static final HttpServer upstream = start();
    static HttpServer start() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/chat", exchange -> {
                count.incrementAndGet();
                received = JsonMapper.builder().build().readTree(exchange.getRequestBody().readAllBytes());
                upstreamAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
                byte[] response = "{\"model\":\"qwen3.6:27b-q4_K_M\",\"done\":true,\"done_reason\":\"stop\",\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status.get(), response.length);
                exchange.getResponseBody().write(response); exchange.close();
            });
            server.start(); return server;
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    @DynamicPropertySource static void settings(DynamicPropertyRegistry registry) {
        registry.add("gateway.upstream", () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add("gateway.api-key-hashes.team1", () -> HexFormat.of().formatHex(ApiKeyFilter.hash(KEY)));
        registry.add("gateway.prefill-batch-size", () -> 1024);
    }
    @Autowired MockMvc mvc;
    static final String BODY = """
        {"model":"qwen3.6:27b-q4_K_M","messages":[{"role":"user","content":"한국어 테스트"}],
         "think":false,"stream":false,"keep_alive":"forever",
         "options":{"num_ctx":8192,"num_predict":128,"temperature":0.2,"num_gpu":0}}
        """;
    @AfterAll static void close() { upstream.stop(0); }
    @BeforeEach void reset() { count.set(0); status.set(200); received = null; }
    @Test void authenticatesAndForwardsOnlyAllowedFieldsWithoutForwardingTheKey() throws Exception {
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY)
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message.content").value("ok"));
        assertThat(count.get()).isEqualTo(1);
        assertThat(upstreamAuthorization).isNull();
        assertThat(received.path("keep_alive").asString()).isEqualTo("10m");
        assertThat(received.path("options").has("num_gpu")).isFalse();
        assertThat(received.path("options").path("num_ctx").asInt()).isEqualTo(8192);
    }
    @Test void largeContextIsExplicitAndStillBounded() throws Exception {
        String request=BODY.replace("8192","18432").replace("한국어 테스트","token ".repeat(9000));
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isOk());
        assertThat(received.path("options").path("num_ctx").asInt()).isEqualTo(18432);
        count.set(0);
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("8192","18432").replace("한국어 테스트","token ".repeat(18500)))).andExpect(status().isBadRequest());
        assertThat(count.get()).isZero();
    }
    @Test void prefillBatchIsHostControlledAndCompactSchemasAreExplicit() throws Exception {
        mvc.perform(get("/api/limits").header("Authorization","Bearer "+KEY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.compactSourceSchemas").value(true))
                .andExpect(jsonPath("$.prefillBatchSize").value(1024)).andExpect(jsonPath("$.contextLengths[3]").value(32768));
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("\"num_gpu\":0","\"num_gpu\":0,\"num_batch\":999999"))).andExpect(status().isOk());
        assertThat(received.at("/options/num_batch").asInt()).isEqualTo(1024);
        var mapper=JsonMapper.builder().build();var body=(tools.jackson.databind.node.ObjectNode)mapper.readTree(BODY);
        for(var schema:java.util.List.of(
                oneuldo.ai.client.SourceOutputSchemas.compactAnalysisReview(java.util.List.of("E1"),java.util.List.of("S1"),mapper.createArrayNode(),java.util.List.of(1)),
                oneuldo.ai.client.SourceOutputSchemas.userProfile(java.util.List.of("R1"),java.util.List.of("K13-C1")),
                oneuldo.ai.client.SourceOutputSchemas.groundedTextPatch(java.util.List.of("/summary","/uncertainties/0","/findings/0/alternativeExplanations/0")))) {
            body.set("format",schema);
            mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isOk());
            assertThat(received.path("format")).isEqualTo(schema);
            schema.put("additionalProperties",true);
            mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isBadRequest());
        }
    }
    @Test void largerOutputStillRequiresAuthenticationAndFitsTheSameContextBudget() throws Exception {
        mvc.perform(get("/api/limits")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/limits").header("Authorization", "Bearer " + KEY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.maxOutputTokens").value(3200))
                .andExpect(jsonPath("$.contextLengths[2]").value(24576));
        assertThat(count.get()).isZero();
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("128", "2400").replace("8192", "18432"))).andExpect(status().isOk());
        assertThat(received.path("options").path("num_predict").asInt()).isEqualTo(2400);
        count.set(0);
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("128", "3201"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("128", "2400").replace("8192", "18432")
                        .replace("한국어 테스트", "token ".repeat(16200)))).andExpect(status().isBadRequest());
        assertThat(count.get()).isZero();
    }
    @Test void expandedContextAndOutputRemainBoundedBeforeCallingOllama() throws Exception {
        String request=BODY.replace("8192","24576").replace("128","3200");
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY)
                .contentType(MediaType.APPLICATION_JSON).content(request.replace("한국어 테스트","token ".repeat(20000))))
                .andExpect(status().isOk());
        assertThat(received.path("options").path("num_ctx").asInt()).isEqualTo(24576);
        assertThat(received.path("options").path("num_predict").asInt()).isEqualTo(3200);
        count.set(0);
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY)
                .contentType(MediaType.APPLICATION_JSON).content(request.replace("한국어 테스트","token ".repeat(21500))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY)
                .contentType(MediaType.APPLICATION_JSON).content(request.replace("24576","65536")))
                .andExpect(status().isBadRequest());
        assertThat(count.get()).isZero();
    }
    @Test void forwardsOnlyTheFixedObservationSchema() throws Exception {
        var mapper=JsonMapper.builder().build();
        var body=(tools.jackson.databind.node.ObjectNode)mapper.readTree(BODY);
        for (var schema : java.util.List.of(oneuldo.ai.client.ObservationOutputSchema.LEGACY_VALUE,
                oneuldo.ai.client.ObservationOutputSchema.VALUE,
                oneuldo.ai.client.SourceOutputSchemas.questReview(java.util.List.of("E1","E2336")),
                oneuldo.ai.client.SourceOutputSchemas.analysisReview(java.util.List.of("E1"),java.util.List.of("S1"),mapper.createArrayNode(),java.util.List.of()))) {
            body.set("format",mapper.valueToTree(schema));
            mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY)
                    .contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isOk());
            assertThat(received.path("format")).isEqualTo(body.path("format"));
        }
        count.set(0);
        for(String format: new String[]{"null", "\"json\"", "{\"type\":\"object\"}"}) {
            body.set("format",mapper.readTree(format));
            mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY)
                    .contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isBadRequest());
        }
        assertThat(count.get()).isZero();
    }
    @Test void deniesMissingAndWrongKeysAndBlocksManagementEndpoints() throws Exception {
        mvc.perform(post("/api/chat").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/tags").header("Authorization", "Bearer wrong-key-000000000000000000000000"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/pull").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/tags").header("Authorization", "Bearer " + KEY)).andExpect(status().isOk());
        mvc.perform(get("/healthz")).andExpect(status().isOk());
        assertThat(count.get()).isZero();
    }
    @Test void rejectsUnsafeLimitsMalformedJsonAndOversizedInputBeforeInference() throws Exception {
        for (String body : new String[]{"{", BODY.replace("8192", "16384"), BODY.replace("128", "-1"),
                BODY.replace("\"stream\":false", "\"stream\":true"), BODY.replace("한국어 테스트", "token ".repeat(9000)),
                BODY.replace("qwen3.6:27b-q4_K_M", "unknown"), BODY.replace("\"role\":\"user\"", "\"images\":[],\"role\":\"user\"")}) {
            mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON).content(" ".repeat(ChatController.MAX_BYTES + 1)))
                .andExpect(status().isPayloadTooLarge());
        assertThat(count.get()).isZero();
    }
    @Test void upstreamFailureDoesNotRetryAndDoesNotLeakQueuePermits() throws Exception {
        status.set(503);
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error").value("OLLAMA_UNAVAILABLE"));
        assertThat(count.get()).isEqualTo(1);
        status.set(200);
        mvc.perform(post("/api/chat").header("Authorization", "Bearer " + KEY).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk());
    }
    @Test void allows_only_the_source_constrained_schema_templates() throws Exception {
        var mapper=JsonMapper.builder().build();var body=(tools.jackson.databind.node.ObjectNode)mapper.readTree(BODY);
        for(var schema:java.util.List.of(oneuldo.ai.client.SourceOutputSchemas.digest(java.util.Set.of("E1","E2")),oneuldo.ai.client.SourceOutputSchemas.adaptive(java.util.Set.of("E1","E55")))) {
            body.set("format",schema);mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isOk());
        }
        count.set(0);((tools.jackson.databind.node.ObjectNode)body.path("format")).put("$ref","https://untrusted.invalid/schema");
        mvc.perform(post("/api/chat").header("Authorization","Bearer "+KEY).contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isBadRequest());assertThat(count.get()).isZero();
    }
}
