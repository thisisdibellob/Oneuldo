package oneuldo.ai.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;

import oneuldo.ai.config.GroqProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RestGroqChatClientTest {

    @Test
    void Qwen_비추론_모드로_Chat_Completions를_호출한다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestGroqChatClient client = new RestGroqChatClient(
                builder.baseUrl("https://api.groq.com").build(),
                new GroqProperties(
                        true,
                        "test-key",
                        "https://api.groq.com",
                        "qwen/qwen3.6-27b",
                        Duration.ofSeconds(20)
                )
        );
        server.expect(once(), requestTo("https://api.groq.com/openai/v1/chat/completions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-key"))
                .andExpect(content().json("""
                        {
                          "model": "qwen/qwen3.6-27b",
                          "max_completion_tokens": 256,
                          "reasoning_effort": "none",
                          "reasoning_format": "hidden",
                          "stream": false
                        }
                        """, false))
                .andRespond(withSuccess("""
                        {
                          "model": "qwen/qwen3.6-27b",
                          "choices": [{"message": {"role": "assistant", "content": "생성 결과"}}]
                        }
                        """, MediaType.APPLICATION_JSON));

        GroqChatClient.GroqChatResult result = client.complete("시스템", "사용자");

        assertEquals("생성 결과", result.text());
        assertEquals("qwen/qwen3.6-27b", result.model());
        server.verify();
    }
}
