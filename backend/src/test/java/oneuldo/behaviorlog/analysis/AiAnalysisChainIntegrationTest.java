package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.*;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.AiBehaviorAnalysisRepository;
import oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisService;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.*;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.type.*;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationListener;
import oneuldo.behaviorlog.personalization.repository.MarketAiQuestGenerationRepository;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestService;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.*;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:ai-analysis-chain;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AiAnalysisChainIntegrationTest {
    @Autowired private MemberRepository members;
    @Autowired private BehaviorLogService logs;
    @Autowired private AiBehaviorAnalysisService analyses;
    @Autowired private AiBehaviorAnalysisRepository runs;
    @Autowired private MarketAiQuestService quests;
    @Autowired private MarketAiQuestGenerationRepository generations;
    @Autowired private NormalizedBehaviorEventRepository normalized;
    @Autowired private ApplicationContext context;
    @Autowired private ObjectMapper mapper;
    @Autowired private JwtTokenProvider tokens;
    @Autowired private MockMvc mvc;
    @MockitoBean private GroqChatClient client;

    @Test
    void 원본에서_AI분석과_연습목표를_거쳐_퀘스트까지_연결하고_영속화한다() throws Exception {
        var member = member();
        UUID eventId = log(member);
        stubAnalysisAndQuest(false);
        long normalizedBefore = normalized.count();
        var quest = quests.generate(member.getId());
        var run = runs.findById(quest.analysisId()).orElseThrow();
        assertThat(quest.source()).isEqualTo("AI");
        assertThat(quest.quest().difficulty()).isEqualTo(1);
        assertThat(run.getResult().practicePlan().goal()).isEqualTo("목록과 수량 비교 연습");
        assertThat(run.getResult().findings().getFirst().evidenceEventIds()).containsExactly(eventId);
        assertThat(generations.findById(quest.generationId()).orElseThrow().getAnalysisId()).isEqualTo(run.getId());
        assertThat(normalized.count()).isEqualTo(normalizedBefore);
        assertThat(context.getBeansOfType(BehaviorNormalizationListener.class)).isEmpty();
        verify(client).complete(anyString(), contains("목록과 수량 비교 연습"), eq(900), anyDouble());
        var token = tokens.createAccessToken(member);
        mvc.perform(get("/api/behavior-analyses/" + run.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.analysisId").value(run.getId().toString()))
                .andExpect(jsonPath("$.analysis.practicePlan.goal").value("목록과 수량 비교 연습"))
                .andExpect(jsonPath("$.systemPrompt").doesNotExist()).andExpect(jsonPath("$.attempts").doesNotExist());
        mvc.perform(get("/api/behavior-analyses/" + run.getId())
                        .header("Authorization", "Bearer " + tokens.createAccessToken(member())))
                .andExpect(status().isNotFound());
    }

    @Test
    void 퀘스트_API실패를_감사기록으로_남기고_규칙형미션을_반환하지_않는다() {
        var member = member(); log(member); stubAnalysisAndQuest(true);
        long before = generations.count();
        assertThatThrownBy(() -> quests.generate(member.getId())).isInstanceOf(ResponseStatusException.class);
        assertThat(generations.count()).isEqualTo(before + 1);
        var failure = generations.findAll().stream().filter(value -> value.getMember().getId().equals(member.getId())).findFirst().orElseThrow();
        assertThat(failure.getSource()).isEqualTo("FAILED");
        assertThat(failure.getValidatedQuest()).isNull();
        assertThat(failure.getAnalysisId()).isNotNull();
        assertThat(analyses.latest(member.getId()).status()).isEqualTo("READY");
    }

    @Test
    void 기록없는_사용자와_미인증요청을_별도처리한다() throws Exception {
        var member = member(); var token = tokens.createAccessToken(member);
        mvc.perform(get("/api/behavior-analyses/latest").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(post("/api/behavior-analyses").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("NO_HISTORY"));
        mvc.perform(post("/api/behavior-analyses")).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> quests.generate(member.getId())).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(client);
    }

    private void stubAnalysisAndQuest(boolean questFails) {
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble())).thenAnswer(invocation -> {
            if ((int) invocation.getArgument(2) == 900) {
                if (questFails) throw new IllegalStateException("test provider error");
                return new GroqChatClient.GroqChatResult("""
                        {"difficulty":1,"scenarioId":"CUSTOM","title":"수량 비교 연습","description":"목록을 보고 물건을 담아요.","budget":4000,
                         "objectives":[{"productId":"milk","quantity":1},{"productId":"apple","quantity":1}],
                         "briefing":["목록과 수량을 비교해요."],"checkoutDialogue":["수량을 확인해요.","계산을 진행해요."],
                         "successMessage":"연습을 마쳤어요.","adaptationSummary":"수량 비교 관찰에 따른 연습","reasonCodes":["QUANTITY_PRACTICE"]}
                        """, "mock-qwen");
            }
            var session = mapper.readTree((String) invocation.getArgument(1)).path("behaviorTimeline").path("sessions").get(0);
            var eventId = UUID.fromString(session.path("events").get(0).path("behaviorLogId").asString());
            var sessionId = UUID.fromString(session.path("sessionId").asString());
            var analysis = new AiBehaviorAnalysis("목록을 열었습니다.",
                    List.of(new AiBehaviorAnalysis.Finding("F1", "수량 확인", "목록을 열었습니다.", "수량을 확인했을 가능성이 있습니다.",
                            List.of("단순 탐색일 수도 있습니다."), List.of(eventId), "목록을 함께 읽습니다.")),
                    List.of(new AiBehaviorAnalysis.SessionAssessment(sessionId, "UNDETERMINED", "장면이 끝나지 않았습니다.", List.of(eventId))),
                    List.of("실생활 수행은 알 수 없습니다."),
                    new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "목록과 수량 비교 연습", "목록 열람 행동과 연결", 1, 2,
                            "LOW", "LOW", "SIMPLIFIED", List.of("QUANTITY_PRACTICE")));
            return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(analysis), "mock-qwen");
        });
    }

    private Member member() {
        String id = UUID.randomUUID().toString();
        return members.save(new Member("ai-" + id, "encoded-test-password", "테스트", id + "@example.com",
                MemberRole.CHILD, LocalDate.of(2000, 1, 1)));
    }

    private UUID log(Member member) {
        var request = new BehaviorLogRequest(
                new EventMetadata(UUID.randomUUID(), 1L, BehaviorLogService.SUPPORTED_SCHEMA_VERSION, "test", "market-v1", false, null, Instant.now()),
                new IdentityContext(UUID.randomUUID()),
                new TaskContext("MARKET_SIMULATION", UUID.randomUUID(), "market-v1", 2, "BASELINE", EvidenceContext.ASSESSMENT_TASK),
                new ActionContext("SHOP.LIST_OPENED", "LIST", null, StepOutcome.SUCCESS, 1, null, null),
                new AccessibilityContext(InstructionMode.TEXT, TextLevel.STANDARD, false, true, ControllerMode.TOUCH),
                null, null, null, null, null, null, null, null, null,
                mapper.readValue("{\"type\":\"SHOPPING\",\"listOpenCount\":1}", BehaviorPayload.class));
        return logs.record(member.getId(), request).id();
    }
}
