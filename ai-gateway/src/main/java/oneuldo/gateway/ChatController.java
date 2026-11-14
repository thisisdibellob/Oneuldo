package oneuldo.gateway;

import java.io.IOException;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import oneuldo.ai.client.ObservationOutputSchema;
import jakarta.servlet.http.HttpServletRequest;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RestController
public class ChatController {
    static final String MODEL = "qwen3.6:27b-q4_K_M";
    static final int MAX_OUTPUT_TOKENS = 3200;
    static final List<Integer> CONTEXT_LENGTHS = List.of(8192, 18432, 24576, 32768);
    static final int MAX_BYTES = 131072;
    private final ObjectMapper mapper;
    private final InferenceGate gate;
    private final RestClient upstream;
    private final GatewaySettings settings;
    private final GatewayTokenCounter tokenizer;
    public ChatController(ObjectMapper mapper, InferenceGate gate, GatewaySettings settings,GatewayTokenCounter tokenizer) {
        this.mapper = mapper; this.gate = gate;this.settings=settings;this.tokenizer=tokenizer;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(settings.timeout());
        upstream = RestClient.builder().baseUrl(settings.upstream().toString()).requestFactory(factory).build();
    }
    @GetMapping("/healthz") public Map<String, String> health() { return Map.of("status", "up"); }
    @GetMapping("/api/tags") public Object tags() { return Map.of("models", List.of(Map.of("name", MODEL, "model", MODEL))); }

    @GetMapping("/api/limits") public Object limits() {
        var limits=new HashMap<String,Object>(Map.of("model", MODEL, "maxOutputTokens", MAX_OUTPUT_TOKENS,
                "contextLengths", CONTEXT_LENGTHS,"sourceBoundSchemas",true,"compactSourceSchemas",true,"citationPoolSchemas",true,"groundedTextPatchSchemas",true,"parallelism",settings.parallelism(),"maxPerKey",settings.maxPerKey(),"prefillBatchSize",settings.prefillBatchSize()));
        limits.put("groundedTextPatchSchemaVersion",3);limits.put("concretePracticeSchemas",true);limits.put("concretePracticeSchemaVersion",2);return limits;
    }

    // Read a bounded body explicitly; callers cannot reach Ollama management endpoints or select URLs.
    @PostMapping(value="/api/chat", consumes=MediaType.APPLICATION_JSON_VALUE, produces=MediaType.APPLICATION_JSON_VALUE)
    public JsonNode chat(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > MAX_BYTES) throw error(HttpStatus.PAYLOAD_TOO_LARGE, "BODY_TOO_LARGE");
        byte[] bytes = request.getInputStream().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw error(HttpStatus.PAYLOAD_TOO_LARGE, "BODY_TOO_LARGE");
        JsonNode body;
        try { body = mapper.readTree(bytes); } catch (RuntimeException e) { throw error(HttpStatus.BAD_REQUEST, "INVALID_JSON"); }
        validate(body);
        var options = body.path("options");
        int context = options.has("num_ctx") ? options.path("num_ctx").asInt() : 8192;
        int output = options.has("num_predict") ? options.path("num_predict").asInt() : 1800;
        long tokens = 64 + output;
        var text=new java.util.ArrayList<String>();body.path("messages").forEach(m->text.add(m.path("content").asString()));
        for(int count:tokenizer.count(text))tokens+=count+16L;
        if (tokens > context - 256) throw error(HttpStatus.BAD_REQUEST, "CONTEXT_LIMIT_EXCEEDED");
        double temperature = options.has("temperature") ? options.path("temperature").asDouble() : 0.2;
        // Rebuild from allowlisted fields. No client-supplied tools, images, templates, URLs or model-loading options.
        var wire = new HashMap<String,Object>(Map.of("model", MODEL, "messages", body.path("messages"), "think", false, "stream", false,
                "keep_alive", "10m", "options", Map.of("num_ctx", context, "num_predict", output, "temperature", temperature, "top_p", 0.8,"num_batch",settings.prefillBatchSize())));
        if (body.has("format")) wire.put("format", body.get("format"));
        return gate.run((String)request.getAttribute(ApiKeyFilter.IDENTITY), () -> {
            try {
                JsonNode result = upstream.post().uri("/api/chat").body(wire).retrieve().body(JsonNode.class);
                if (result == null || result.has("error") || !result.path("done").asBoolean()) throw error(HttpStatus.BAD_GATEWAY, "INVALID_UPSTREAM_RESPONSE");
                return result;
            } catch (RestClientException e) { throw error(HttpStatus.BAD_GATEWAY, "OLLAMA_UNAVAILABLE"); }
        });
    }
    private void validate(JsonNode body) {
        if (body == null || !body.isObject() || !MODEL.equals(body.path("model").asString())
                || (body.has("stream") && (!body.path("stream").isBoolean() || body.path("stream").asBoolean()))
                || (body.has("think") && (!body.path("think").isBoolean() || body.path("think").asBoolean()))) throw error(HttpStatus.BAD_REQUEST, "UNSUPPORTED_REQUEST");
        if (body.has("format") && !oneuldo.ai.client.SourceOutputSchemas.allowed(body.path("format")))
            throw error(HttpStatus.BAD_REQUEST, "UNSUPPORTED_OUTPUT_SCHEMA");
        var messages = body.path("messages");
        if (!messages.isArray() || messages.isEmpty() || messages.size() > 32) throw error(HttpStatus.BAD_REQUEST, "INVALID_MESSAGES");
        for (var message : messages) {
            if (!message.isObject() || message.size() != 2 || !message.path("content").isString()
                    || !List.of("system", "user", "assistant").contains(message.path("role").asString())) throw error(HttpStatus.BAD_REQUEST, "INVALID_MESSAGES");
        }
        var options = body.path("options");
        if (body.has("options") && !options.isObject()) throw error(HttpStatus.BAD_REQUEST, "INVALID_OPTIONS");
        if (options.has("num_ctx") && (!options.path("num_ctx").isIntegralNumber() || !CONTEXT_LENGTHS.contains(options.path("num_ctx").asInt()))) throw error(HttpStatus.BAD_REQUEST, "UNSUPPORTED_CONTEXT_LENGTH");
        if (options.has("num_predict") && (!options.path("num_predict").isIntegralNumber()
                || options.path("num_predict").asLong() < 1 || options.path("num_predict").asLong() > MAX_OUTPUT_TOKENS)) throw error(HttpStatus.BAD_REQUEST, "INVALID_OUTPUT_LIMIT");
        if (options.has("temperature") && (!options.path("temperature").isNumber()
                || options.path("temperature").asDouble() < 0 || options.path("temperature").asDouble() > 2)) throw error(HttpStatus.BAD_REQUEST, "INVALID_TEMPERATURE");
    }
    private ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
}
