package oneuldo.ai.client;

import java.util.List;

import oneuldo.ai.config.GroqProperties;
import oneuldo.ai.exception.CloudAiRateLimitException;
import oneuldo.ai.exception.CloudAiUnavailableException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class RestGroqChatClient implements GroqChatClient {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RestGroqChatClient.class);

    @Qualifier("groqRestClient")
    private final RestClient restClient;
    private final GroqProperties properties;
    private final oneuldo.behaviorlog.analysis.service.AnalysisCallPacer pacer;
    @org.springframework.beans.factory.annotation.Autowired
    public RestGroqChatClient(@Qualifier("groqRestClient") RestClient restClient, GroqProperties properties,
            oneuldo.behaviorlog.analysis.service.AnalysisCallPacer pacer) {
        this.restClient=restClient;this.properties=properties;this.pacer=pacer;
    }
    public RestGroqChatClient(RestClient restClient,GroqProperties properties) {
        this(restClient,properties,new oneuldo.behaviorlog.analysis.service.AnalysisCallPacer());
    }

    @Override
    public GroqChatResult complete(String systemPrompt, String userPrompt) {
        return complete(systemPrompt, userPrompt, 256, 0.7);
    }

    @Override
    public GroqChatResult complete(String systemPrompt, String userPrompt,
            int maxCompletionTokens, double temperature) {
        if (!properties.available()) {
            throw new CloudAiUnavailableException("Groq API가 활성화되지 않았습니다.");
        }
        var reservation=pacer.acquire(oneuldo.behaviorlog.analysis.service.QwenTokenCounter.inputTokens(systemPrompt,userPrompt),maxCompletionTokens);
        long started=System.nanoTime();
        try {
            var entity = restClient.post()
                    .uri("/openai/v1/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
                    .body(new GroqRequest(
                            properties.model(),
                            List.of(
                                    new Message("system", systemPrompt),
                                    new Message("user", userPrompt)
                            ),
                            maxCompletionTokens,
                            temperature,
                            0.8,
                            "none",
                            "hidden",
                            false
                    ))
                    .retrieve()
                    .toEntity(GroqResponse.class);
            GroqResponse response=entity.getBody();
            pacer.completed(reservation,response==null||response.usage()==null?null:response.usage().prompt_tokens(),
                    response==null||response.usage()==null?null:response.usage().completion_tokens(),entity.getHeaders().toSingleValueMap());
            if (response == null || response.choices() == null || response.choices().isEmpty()
                    || response.choices().getFirst().message() == null
                    || response.choices().getFirst().message().content() == null
                    || response.choices().getFirst().message().content().isBlank()) {
                throw new CloudAiUnavailableException("Groq API가 빈 결과를 반환했습니다.");
            }
            return new GroqChatResult(
                    response.choices().getFirst().message().content(),
                    response.model() == null ? properties.model() : response.model(),
                    response.choices().getFirst().finish_reason(), response.usage()==null?null:response.usage().prompt_tokens(),
                    response.usage()==null?null:response.usage().completion_tokens(),(System.nanoTime()-started)/1000000
            );
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 429) {
                pacer.limited(exception.getResponseHeaders()==null?java.util.Map.of():exception.getResponseHeaders().toSingleValueMap(),exception.getResponseBodyAsString());
                log.warn("Groq HTTP 429: {}", rateLimitDetails(exception));
                throw new CloudAiRateLimitException(
                        exception.getResponseHeaders() == null
                                ? null
                                : exception.getResponseHeaders().getFirst("retry-after"),
                        exception
                );
            }
            throw new CloudAiUnavailableException(
                    "Groq API 호출에 실패했습니다: " + exception.getStatusCode().value(),
                    exception
            );
        } catch (ResourceAccessException exception) {
            throw new CloudAiUnavailableException("Groq API 응답 시간이 초과되었습니다.", exception);
        }
    }

    // Log only allowlisted limit metadata, never prompts, credentials or the raw provider response.
    static String rateLimitDetails(RestClientResponseException exception) {
        String body = exception.getResponseBodyAsString();
        String kind = body.contains("output tokens per minute") ? "OTPM" : body.contains("input tokens per minute") ? "ITPM"
                : body.contains("tokens per minute") ? "TPM" : body.contains("tokens per day") ? "TPD"
                : body.contains("requests per minute") ? "RPM" : body.contains("requests per day") ? "RPD" : "unknown";
        StringBuilder details = new StringBuilder("kind=").append(kind);
        var numbers = java.util.regex.Pattern.compile("(?i)\\b(Limit|Requested|Used)[:= ]+(\\d+)").matcher(body);
        while (numbers.find()) details.append(' ').append(numbers.group(1)).append('=').append(numbers.group(2));
        if (exception.getResponseHeaders() != null) {
            for (String key : List.of("retry-after", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens",
                    "x-ratelimit-reset-tokens", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests")) {
                String value = exception.getResponseHeaders().getFirst(key);
                if (value != null && value.matches("[0-9.hms-]{1,64}")) details.append(' ').append(key).append('=').append(value);
            }
        }
        return details.toString();
    }

    private record GroqRequest(
            String model,
            List<Message> messages,
            int max_completion_tokens,
            double temperature,
            double top_p,
            String reasoning_effort,
            String reasoning_format,
            boolean stream
    ) {
    }

    private record Message(String role, String content) {
    }

    private record GroqResponse(String model, List<Choice> choices, Usage usage) {
    }

    private record Choice(Message message,String finish_reason) {
    }
    private record Usage(Integer prompt_tokens,Integer completion_tokens) {}
}
