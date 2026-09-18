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
    private final Semaphore execution = new Semaphore(1, true);
    private final Semaphore admission;

    public RestOllamaChatClient(@Qualifier("ollamaRestClient") RestClient restClient,
            OllamaProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
        this.admission = new Semaphore(properties.maxQueued() + 1);
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

    private GroqChatResult execute(String systemPrompt, String userPrompt, int output, double temperature, Object format) {
        if (output < 1 || Math.addExact(QwenTokenCounter.inputTokens(systemPrompt, userPrompt), output)
                > properties.contextLength() - 256) {
            throw new IllegalArgumentException("OLLAMA_CONTEXT_LIMIT_EXCEEDED");
        }
        String requestId = java.util.UUID.randomUUID().toString();
        long started = System.nanoTime();
        if (!admission.tryAcquire()) throw failure(Code.AI_QUEUE_FULL, requestId, "QUEUE", 0, started, null);
        boolean acquired = false;
        int attempts = 0;
        try {
            acquired = execution.tryAcquire(properties.queueTimeout().toMillis(), TimeUnit.MILLISECONDS);
            if (!acquired) throw failure(Code.AI_QUEUE_TIMEOUT, requestId, "QUEUE", 0, started, null);
            var body = new Request(properties.model(), List.of(new Message("system", systemPrompt),
                    new Message("user", userPrompt)), false, false, properties.keepAlive(),
                    new Options(properties.contextLength(), output, temperature, 0.8), format);
            while (true) {
                attempts++;
                log.info("AI transport start: requestId={}, attempt={}", requestId, attempts);
                Response response;
                try {
                    response = restClient.post().uri("/api/chat")
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
            Integer prompt_eval_count, Integer eval_count, String error) {}
}
