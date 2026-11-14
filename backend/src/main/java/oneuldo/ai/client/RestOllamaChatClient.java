package oneuldo.ai.client;

import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.ai.exception.AiTransportException;
import oneuldo.ai.exception.AiTransportException.Code;
import org.springframework.web.client.RestClientResponseException;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Uses the existing application contract without forwarding failures to a cloud provider. */
@Component
@Profile("ollama")
public class RestOllamaChatClient implements GroqChatClient {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RestOllamaChatClient.class);
    private final RestClient restClient;
    private final OllamaProperties properties;
    private final Semaphore execution;
    private final Semaphore admission;

    public RestOllamaChatClient(@Qualifier("ollamaRestClient") RestClient restClient,
            OllamaProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
        this.execution=new Semaphore(properties.parallelism(),true);
        this.admission = new Semaphore(properties.maxQueued() + properties.parallelism());
    }

    @Override
    public GroqChatResult complete(String systemPrompt, String userPrompt) {
        return complete(systemPrompt, userPrompt, 256, 0.7);
    }

    @Override
    public GroqChatResult complete(String systemPrompt, String userPrompt, int output, double temperature) {
        return execute(systemPrompt, userPrompt, output, temperature, null);
    }

    @Override
    public GroqChatResult completeDigest(String systemPrompt, String userPrompt, int output, double temperature) {
        return execute(systemPrompt, userPrompt, output, temperature, ObservationOutputSchema.VALUE);
    }

    @Override public int maxConcurrency() { return Math.min(properties.parallelism(),capabilities().parallelism()); }
    @Override public boolean supportsSourceSchemas() { return capabilities().sourceSchemas(); }
    @Override public GroqChatResult completeStructured(String system,String prompt,int output,double temperature,Object schema) {
        return execute(system,prompt,output,temperature,schema);
    }
    private record Capabilities(boolean sourceSchemas,boolean compactSchemas,boolean citationPoolSchemas,boolean groundedTextPatchSchemas,boolean groundedCauseEnums,boolean concretePracticeSchemas,int parallelism) {}
    @Override public boolean supportsConcretePracticeSchemas(){return capabilities().concretePracticeSchemas();}
    @Override public boolean supportsCompactSourceSchemas(){return capabilities().compactSchemas();}
    @Override public boolean supportsGroundedCauseEnums(){return capabilities().groundedCauseEnums();}
    @Override public boolean supportsGroundedTextPatchSchemas(){return capabilities().groundedTextPatchSchemas();}
    @Override public boolean supportsCitationPoolSchemas(){return capabilities().citationPoolSchemas();}
    private volatile Capabilities capabilities;
    private volatile long capabilitiesUntil;
    private synchronized Capabilities capabilities() {
        if(capabilities!=null&&System.nanoTime()<capabilitiesUntil)return capabilities;
        Capabilities value=new Capabilities(false,false,false,false,false,false,1);
        try {
            var f=new org.springframework.http.client.JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(5)).build());
            f.setReadTimeout(java.time.Duration.ofSeconds(5));
            var r=restClient.mutate().requestFactory(f).build().get().uri("/api/limits")
                .headers(h->{if(!properties.apiKey().isBlank())h.setBearerAuth(properties.apiKey());}).retrieve().body(java.util.Map.class);
            if(r!=null)value=new Capabilities(Boolean.TRUE.equals(r.get("sourceBoundSchemas")),Boolean.TRUE.equals(r.get("compactSourceSchemas")),Boolean.TRUE.equals(r.get("citationPoolSchemas")),Boolean.TRUE.equals(r.get("groundedTextPatchSchemas"))&&((Number)r.getOrDefault("groundedTextPatchSchemaVersion",1)).intValue()>=2,Boolean.TRUE.equals(r.get("groundedTextPatchSchemas"))&&((Number)r.getOrDefault("groundedTextPatchSchemaVersion",1)).intValue()>=3,Boolean.TRUE.equals(r.get("concretePracticeSchemas"))&&((Number)r.getOrDefault("concretePracticeSchemaVersion",0)).intValue()>=2,Math.max(1,Math.min(2,Math.min(((Number)r.getOrDefault("parallelism",1)).intValue(),((Number)r.getOrDefault("maxPerKey",1)).intValue()))));
        }catch(RuntimeException unavailable){log.info("Gateway capabilities unavailable; retaining single-call fixed-schema compatibility");}
        capabilities=value;capabilitiesUntil=System.nanoTime()+java.time.Duration.ofMinutes(1).toNanos();return value;
    }
    public record Timing(String requestId,long queueMs,long httpMs,Long loadNs,Long promptNs,Long outputNs,Integer cachedPromptTokens) {}
    private final ThreadLocal<Timing> lastTiming=new ThreadLocal<>();
    public Timing lastTiming() { return lastTiming.get(); }

    private GroqChatResult execute(String systemPrompt, String userPrompt, int output, double temperature, Object format) {
        if (output < 1) throw new IllegalArgumentException("INVALID_OUTPUT_TOKEN_BUDGET");
        int required = Math.addExact(QwenTokenCounter.inputTokens(systemPrompt, userPrompt), output);
        if (required > properties.contextLength() - 256)
            throw new oneuldo.ai.exception.AiInputLimitException("OLLAMA_CONTEXT_LIMIT_EXCEEDED", required, properties.contextLength() - 256);
        String requestId = java.util.UUID.randomUUID().toString();
        long started = System.nanoTime();
        if (!admission.tryAcquire()) throw failure(Code.AI_QUEUE_FULL, requestId, "QUEUE", 0, started, null);
        boolean acquired = false;long admittedAt=System.nanoTime();long queueMs=0;
        int attempts = 0;
        try {
            var remaining=AiOperationDeadline.remaining();
            acquired = execution.tryAcquire(remaining==null?properties.queueTimeout().toMillis():Math.min(remaining.toMillis(),properties.queueTimeout().toMillis()), TimeUnit.MILLISECONDS);
            queueMs=elapsed(admittedAt);
            if (!acquired) throw failure(Code.AI_QUEUE_TIMEOUT, requestId, "QUEUE", 0, started, null);
            var body = new Request(properties.model(), List.of(new Message("system", systemPrompt),
                    new Message("user", userPrompt)), false, false, properties.keepAlive(),
                    new Options(properties.contextLength(), output, temperature, 0.8), format);
            long httpStart=System.nanoTime();
            while (true) {
                attempts++;
                log.info("AI transport start: requestId={}, attempt={}", requestId, attempts);
                Response response;
                try {
                    var budget=AiOperationDeadline.remaining();
                    var client=restClient;
                    if(budget!=null) {
                        var factory=new org.springframework.http.client.JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder()
                            .connectTimeout(budget.compareTo(properties.connectTimeout())<0?budget:properties.connectTimeout()).build());
                        factory.setReadTimeout(budget);client=restClient.mutate().requestFactory(factory).build();
                    }
                    response = client.post().uri("/api/chat")
                            .headers(headers -> {
                                headers.set("X-Request-ID", requestId);
                                if (!properties.apiKey().isBlank()) headers.setBearerAuth(properties.apiKey());
                            }).body(body).retrieve().body(Response.class);
                } catch (RestClientException exception) {
                    Code code = classify(exception);
                    // Only failure to establish the connection is replayable. Read timeouts, resets,
                    // HTTP errors and malformed replies may follow an already-started inference.
                    boolean retry = (code == Code.AI_CONNECT_TIMEOUT || code == Code.AI_CONNECT_FAILED)
                            && attempts <= properties.connectRetries();
                    if (!retry) throw failure(code, requestId, stage(code), attempts, started, exception);
                    log.warn("AI transport retry: requestId={}, attempt={}, code={}, elapsedMs={}",
                            requestId, attempts, code, elapsed(started));
                    TimeUnit.MILLISECONDS.sleep(properties.connectRetryDelay().toMillis() * attempts);
                    continue;
                }
                if (response == null || response.error() != null || !Boolean.TRUE.equals(response.done())
                        || response.message() == null || response.message().content() == null
                        || response.message().content().isBlank()) {
                    throw failure(Code.AI_INVALID_RESPONSE, requestId, "RESPONSE", attempts, started, null);
                }
                long elapsed = elapsed(started);
                var timing=new Timing(requestId,queueMs,elapsed(httpStart),response.load_duration(),response.prompt_eval_duration(),response.eval_duration(),response.prompt_eval_cached_count());
                lastTiming.set(timing);
                log.info("AI inference timings: requestId={}, queueMs={}, httpMs={}, loadNs={}, promptNs={}, outputNs={}, cachedPromptTokens={}",
                    requestId,timing.queueMs(),timing.httpMs(),timing.loadNs(),timing.promptNs(),timing.outputNs(),timing.cachedPromptTokens());
                log.info("AI transport complete: requestId={}, attempts={}, elapsedMs={}", requestId, attempts, elapsed);
                return new GroqChatResult(response.message().content(),
                        response.model() == null ? properties.model() : response.model(),
                        response.done_reason(), response.prompt_eval_count(), response.eval_count(), elapsed);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(Code.AI_INTERRUPTED, requestId, "WAIT", attempts, started, exception);
        } finally {
            if (acquired) execution.release();
            admission.release();
        }
    }

    private static Code classify(RestClientException failure) {
        if (failure instanceof RestClientResponseException response) {
            int status = response.getStatusCode().value();
            if (status == 401 || status == 403) return Code.AI_AUTH_FAILED;
            if (status == 429) return Code.AI_RATE_LIMITED;
            return status >= 500 ? Code.AI_SERVER_ERROR : Code.AI_REQUEST_REJECTED;
        }
        if (hasCause(failure, javax.net.ssl.SSLException.class)) return Code.AI_TLS_FAILED;
        if (hasCause(failure, java.net.http.HttpConnectTimeoutException.class)) return Code.AI_CONNECT_TIMEOUT;
        if (hasCause(failure, java.net.UnknownHostException.class)
                || hasCause(failure, java.nio.channels.UnresolvedAddressException.class)) return Code.AI_DNS_FAILED;
        if (hasCause(failure, java.net.ConnectException.class)) return Code.AI_CONNECT_FAILED;
        if (hasCause(failure, java.net.http.HttpTimeoutException.class)
                || hasCause(failure, java.net.SocketTimeoutException.class)) return Code.AI_RESPONSE_TIMEOUT;
        return Code.AI_TRANSPORT_ERROR;
    }
    private static boolean hasCause(Throwable failure, Class<? extends Throwable> type) {
        for (int i = 0; failure != null && i < 12; i++, failure = failure.getCause())
            if (type.isInstance(failure)) return true;
        return false;
    }
    private static String stage(Code code) {
        return switch (code) {
            case AI_CONNECT_TIMEOUT, AI_CONNECT_FAILED, AI_DNS_FAILED, AI_TLS_FAILED -> "CONNECT";
            default -> "RESPONSE";
        };
    }
    private static long elapsed(long start) { return (System.nanoTime() - start) / 1_000_000; }
    private static AiTransportException failure(Code code, String id, String stage, int attempts,
            long started, Throwable cause) {
        Throwable leaf = cause;
        for (int i = 0; leaf != null && leaf.getCause() != null && i < 12; i++) leaf = leaf.getCause();
        Integer status = cause instanceof RestClientResponseException response ? response.getStatusCode().value() : null;
        var details = new AiTransportException.Details(id, stage, leaf == null ? null : leaf.getClass().getSimpleName(),
                status, attempts, elapsed(started));
        log.warn("AI transport failed: requestId={}, stage={}, code={}, httpStatus={}, causeType={}, attempts={}, elapsedMs={}",
                id, stage, code, status, details.causeType(), attempts, details.elapsedMs());
        return new AiTransportException(code, details, cause);
    }

    private record Message(String role, String content) {}
    private record Options(int num_ctx, int num_predict, double temperature, double top_p) {}
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private record Request(String model, List<Message> messages, boolean think, boolean stream,
            String keep_alive, Options options, Object format) {}
    private record Response(String model, Message message, Boolean done, String done_reason,
            Integer prompt_eval_count, Integer eval_count, String error, Long load_duration, Long prompt_eval_duration, Long eval_duration, Integer prompt_eval_cached_count) {}
}
