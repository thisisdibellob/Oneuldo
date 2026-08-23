package oneuldo.ai.client;

import java.util.List;

import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
public class RestGroqChatClient implements GroqChatClient {

    @Qualifier("groqRestClient")
    private final RestClient restClient;
    private final GroqProperties properties;

    @Override
    public GroqChatResult complete(String systemPrompt, String userPrompt) {
        if (!properties.available()) {
            throw new CloudAiUnavailableException("Groq API가 활성화되지 않았습니다.");
        }
        try {
            GroqResponse response = restClient.post()
                    .uri("/openai/v1/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
                    .body(new GroqRequest(
                            properties.model(),
                            List.of(
                                    new Message("system", systemPrompt),
                                    new Message("user", userPrompt)
                            ),
                            256,
                            0.7,
                            0.8,
                            "none",
                            "hidden",
                            false
                    ))
                    .retrieve()
                    .body(GroqResponse.class);
            if (response == null || response.choices() == null || response.choices().isEmpty()
                    || response.choices().getFirst().message() == null
                    || response.choices().getFirst().message().content() == null
                    || response.choices().getFirst().message().content().isBlank()) {
                throw new CloudAiUnavailableException("Groq API가 빈 결과를 반환했습니다.");
            }
            return new GroqChatResult(
                    response.choices().getFirst().message().content(),
                    response.model() == null ? properties.model() : response.model()
            );
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 429) {
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

    private record GroqResponse(String model, List<Choice> choices) {
    }

    private record Choice(Message message) {
    }
}
