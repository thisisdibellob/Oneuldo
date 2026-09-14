package oneuldo.ai.client;

import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.ai.exception.CloudAiUnavailableException;
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
        // Reserve output space before sending: Ollama must not silently discard input to fit.
        if (output < 1 || Math.addExact(QwenTokenCounter.inputTokens(systemPrompt, userPrompt), output)
                > properties.contextLength() - 256) {
            throw new IllegalArgumentException("OLLAMA_CONTEXT_LIMIT_EXCEEDED");
        }
        if (!admission.tryAcquire()) {
            throw new CloudAiUnavailableException("로컬 AI 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.");
        }
        boolean acquired = false;
        long started = System.nanoTime();
        try {
            acquired = execution.tryAcquire(properties.queueTimeout().toMillis(), TimeUnit.MILLISECONDS);
            if (!acquired) throw new CloudAiUnavailableException("로컬 AI 호출 대기 시간이 초과되었습니다.");
            var response = restClient.post().uri("/api/chat")
                    .headers(headers -> {
                        if (!properties.apiKey().isBlank()) headers.setBearerAuth(properties.apiKey());
                    })
                    .body(new Request(properties.model(), List.of(new Message("system", systemPrompt),
                            new Message("user", userPrompt)), false, false, properties.keepAlive(),
                            new Options(properties.contextLength(), output, temperature, 0.8), format))
                    .retrieve().body(Response.class);
            if (response == null || response.error() != null || !Boolean.TRUE.equals(response.done())
                    || response.message() == null || response.message().content() == null
                    || response.message().content().isBlank()) {
                throw new CloudAiUnavailableException("로컬 AI가 완성된 응답을 반환하지 않았습니다.");
            }
            return new GroqChatResult(response.message().content(),
                    response.model() == null ? properties.model() : response.model(),
                    response.done_reason(), response.prompt_eval_count(), response.eval_count(),
                    (System.nanoTime() - started) / 1_000_000);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CloudAiUnavailableException("로컬 AI 호출 대기가 중단되었습니다.", exception);
        } catch (RestClientException exception) {
            throw new CloudAiUnavailableException("로컬 AI 연결 또는 응답 처리에 실패했습니다.", exception);
        } finally {
            if (acquired) execution.release();
            admission.release();
        }
    }

    private record Message(String role, String content) {}
    private record Options(int num_ctx, int num_predict, double temperature, double top_p) {}
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private record Request(String model, List<Message> messages, boolean think, boolean stream,
            String keep_alive, Options options, Object format) {}
    private record Response(String model, Message message, Boolean done, String done_reason,
            Integer prompt_eval_count, Integer eval_count, String error) {}
}
