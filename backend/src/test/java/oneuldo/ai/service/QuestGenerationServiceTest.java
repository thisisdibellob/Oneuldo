package oneuldo.ai.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import oneuldo.ai.client.GroqChatClient;
import oneuldo.ai.config.GroqProperties;
import oneuldo.ai.dto.QuestGenerationRequest;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.service.QuestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class QuestGenerationServiceTest {

    @Mock QuestService questService;
    @Mock GroqChatClient groqChatClient;

    private QuestGenerationService service;
    private QuestDetailResponse quest;

    @BeforeEach
    void setUp() {
        quest = QuestGenerationPromptFactoryTest.quest();
        var objectMapper = new ObjectMapper();
        var ruleBook = new KoreanPublicTransportRuleBook(objectMapper);
        service = new QuestGenerationService(
                questService,
                new QuestGenerationPromptFactory(ruleBook),
                ruleBook,
                new TransportIncidentCatalog(objectMapper),
                groqChatClient,
                new GroqProperties(true, "secret", "https://api.groq.com", "qwen/qwen3.6-27b", Duration.ofSeconds(20))
        );
    }

    @Test
    void DB_원본으로_프롬프트를_만들고_Groq_결과를_반환한다() {
        QuestGenerationRequest request = request("BUS_WEATHER_VISIBILITY");
        when(questService.findQuestDetail(quest.id())).thenReturn(quest);
        when(groqChatClient.complete(
                contains("한국의 아동용 대중교통 퀘스트"),
                contains("정류장에 버스가 도착했어요")
        )).thenReturn(new GroqChatClient.GroqChatResult("비가 오는 날, 버스가 도착했어요.\n번호를 확인한다.\n바로 탄다.", "qwen/qwen3.6-27b"));

        var response = service.generate(request);

        assertEquals(request.requestId(), response.requestId());
        assertEquals("qwen/qwen3.6-27b", response.model());
        assertEquals(3, response.text().lines().count());
    }

    @Test
    void 허용되지_않은_돌발상황은_Groq를_호출하지_않는다() {
        when(questService.findQuestDetail(quest.id())).thenReturn(quest);

        assertThrows(IllegalArgumentException.class, () -> service.generate(request("SUBWAY_PLATFORM_CHANGED")));

        verify(groqChatClient, never()).complete(anyString(), anyString());
    }

    private QuestGenerationRequest request(String incidentType) {
        return new QuestGenerationRequest(
                quest.id(),
                quest.steps().getFirst().id(),
                "request-1",
                incidentType,
                null
        );
    }
}
