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

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:ai-analysis-chain;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "ai.behavior-analysis.request-token-budget=12000"}) // Mock-provider contract test; not the real account limit.
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
    @MockitoBean private oneuldo.behaviorlog.analysis.service.AnalysisCallPacer pacer;

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
            if (((String) invocation.getArgument(0)).contains("퀘스트 설계자")) {
                if (questFails) throw new IllegalStateException("test provider error");
                return new GroqChatClient.GroqChatResult("""
                        {"difficulty":1,"scenarioId":"CUSTOM","title":"수량 비교 연습","description":"목록을 보고 물건을 담아요.","budget":4000,
                         "objectives":[{"productId":"milk","quantity":1},{"productId":"apple","quantity":1}],
                         "briefing":["목록과 수량을 비교해요."],"checkoutDialogue":["수량을 확인해요.","계산을 진행해요."],
                         "successMessage":"연습을 마쳤어요.","adaptationSummary":"수량 비교 관찰에 따른 연습","reasonCodes":["QUANTITY_PRACTICE"]}
                        """, "mock-qwen");
            }
            var session = new oneuldo.behaviorlog.analysis.service.CompactBehaviorTimeline(mapper)
                    .decodeWithTables(mapper.readTree((String) invocation.getArgument(1)).path("behaviorTimeline")).path("sessions").get(0);
            String eventAlias = session.path("events").get(0).path("behaviorLogId").asString();
            String sessionAlias = session.path("sessionId").asString();
            var eventId = UUID.randomUUID();
            var sessionId = UUID.randomUUID();
            var analysis = new AiBehaviorAnalysis("목록을 열었습니다.",
                    List.of(new AiBehaviorAnalysis.Finding("F1", "수량 확인", "목록을 열었습니다.", "수량을 확인했을 가능성이 있습니다.",
                            List.of("단순 탐색일 수도 있습니다."), List.of(eventId), "목록을 함께 읽습니다.")),
                    List.of(new AiBehaviorAnalysis.SessionAssessment(sessionId, "UNDETERMINED", "장면이 끝나지 않았습니다.", List.of(eventId))),
                    List.of("실생활 수행은 알 수 없습니다."),
                    new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "목록과 수량 비교 연습", "목록 열람 행동과 연결", 1, 2,
                            "LOW", "LOW", "SIMPLIFIED", List.of("QUANTITY_PRACTICE")));
            return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(analysis)
                    .replace(eventId.toString(), eventAlias).replace(sessionId.toString(), sessionAlias), "mock-qwen");
        });
    }

    @Test
    void 스냅샷_재분석_API는_인증과_소유권을_검사한다() throws Exception {
        var owner = member();
        log(owner);
        stubAnalysisAndQuest(false);
        var first = analyses.analyze(owner.getId(), new BehaviorAnalysisInputRequest(null, null));
        String path = "/api/behavior-analyses/datasets/" + first.datasetId();
        clearInvocations(client);
        mvc.perform(post(path)).andExpect(status().isUnauthorized());
        mvc.perform(post(path).header("Authorization", "Bearer " + tokens.createAccessToken(member())))
                .andExpect(status().isNotFound());
        verifyNoInteractions(client);
        mvc.perform(post(path).header("Authorization", "Bearer " + tokens.createAccessToken(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.datasetId").value(first.datasetId().toString()))
                .andExpect(jsonPath("$.eventCount").value(first.eventCount()));
    }

    private Member member() {
        String id = UUID.randomUUID().toString();
        return members.save(new Member("ai-" + id, "encoded-test-password", "테스트", id + "@example.com",
                MemberRole.CHILD, LocalDate.of(2000, 1, 1)));
    }

    @Test void 같은스냅샷은_DB체크포인트를_검증후_재사용하고_다른소유자는_재개하지_못한다() throws Exception {
        var owner=member();log(owner);stubAnalysisAndQuest(false);
        var first=analyses.analyze(owner.getId(),new BehaviorAnalysisInputRequest(null,null));
        assertThat(first.status()).isEqualTo("READY");
        clearInvocations(client);
        var second=analyses.resume(owner.getId(),first.analysisId());
        assertThat(second.status()).isEqualTo("READY");
        assertThat(second.analysis()).isEqualTo(first.analysis());
        assertThat(second.analysisId()).isEqualTo(first.analysisId()); // Exact READY result is now reused before the pipeline.
        verifyNoInteractions(client);
        mvc.perform(post("/api/behavior-analyses/"+first.analysisId()+"/resume")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/behavior-analyses/"+first.analysisId()+"/resume").header("Authorization","Bearer "+tokens.createAccessToken(member())))
                .andExpect(status().isNotFound());
        verifyNoInteractions(client);
    }

    private UUID log(Member member) {
        return log(member,UUID.randomUUID(),1L);
    }

    @Test void 퀘스트_동시3요청과_재진입은_분석과_퀘스트를_각1회만_호출한다() throws Exception {
        var owner=member();var session=UUID.randomUUID();log(owner,session,1);
        stubAnalysisAndQuest(false);
        var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        // Block before the actual analysis path so the other two callers must join the active generation.
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var gatedPrompts=new oneuldo.behaviorlog.personalization.service.MarketAiQuestPromptFactory(mapper) {
            @Override public String userPrompt(AiBehaviorAnalysisResponse a,oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse r) {
                calls.incrementAndGet();entered.countDown();
                try {assertThat(release.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();}
                catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
                return super.userPrompt(a,r);
            }
        };
        var service=new MarketAiQuestService(analyses,gatedPrompts,new oneuldo.behaviorlog.personalization.service.MarketAiQuestValidator(),
                context.getBean(oneuldo.behaviorlog.personalization.service.MarketDifficultyRecommendationService.class),
                context.getBean(oneuldo.behaviorlog.personalization.service.MarketAiQuestAuditService.class),client,mapper);
        var first=new java.util.concurrent.FutureTask<>(()->service.generate(owner.getId()));Thread.ofPlatform().start(first);
        assertThat(entered.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        var second=new java.util.concurrent.FutureTask<>(()->service.generate(owner.getId()));var t2=Thread.ofPlatform().start(second);
        var third=new java.util.concurrent.FutureTask<>(()->service.generate(owner.getId()));var t3=Thread.ofPlatform().start(third);
        try {SingleFlightTest.awaitWaiting(t2);SingleFlightTest.awaitWaiting(t3);}finally{release.countDown();}
        var result=first.get(10,java.util.concurrent.TimeUnit.SECONDS);
        assertThat(second.get(10,java.util.concurrent.TimeUnit.SECONDS).generationId()).isEqualTo(result.generationId());
        assertThat(third.get(10,java.util.concurrent.TimeUnit.SECONDS).generationId()).isEqualTo(result.generationId());
        assertThat(calls).hasValue(1);
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
        clearInvocations(client);
        // A separate service object has no in-flight state: completed reuse must come from the database.
        var replay=quests.generate(owner.getId());
        assertThat(replay.generationId()).isEqualTo(result.generationId());
        assertThat(replay.analysisId()).isEqualTo(result.analysisId());
        verifyNoInteractions(client);
        log(owner,session,2);
        var updated=quests.generate(owner.getId());
        assertThat(updated.generationId()).isNotEqualTo(result.generationId());
        assertThat(updated.analysisId()).isNotEqualTo(result.analysisId());
        assertThat(analyses.find(owner.getId(),updated.analysisId()).eventCount()).isEqualTo(2);
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
    }

    @Test void 실패한_분석도_동일스냅샷으로_재시도하며_READY만_재사용한다() {
        var owner=member();log(owner);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenThrow(new IllegalStateException("test failure"));
        var failed=analyses.analyze(owner.getId(),null);
        assertThat(failed.status()).isEqualTo("FAILED");
        reset(client);stubAnalysisAndQuest(false);
        var retry=analyses.analyze(owner.getId(),null);
        assertThat(retry.status()).isEqualTo("READY");
        assertThat(retry.datasetId()).isEqualTo(failed.datasetId());
        assertThat(retry.analysisId()).isNotEqualTo(failed.analysisId());
        clearInvocations(client);
        assertThat(analyses.analyze(owner.getId(),null).analysisId()).isEqualTo(retry.analysisId());
        verifyNoInteractions(client);
    }

    @Test void 실제_HTTP_동시_분석요청3개는_분석ID와_스냅샷을_공유한다() throws Exception {
        var owner=member();log(owner);String token=tokens.createAccessToken(owner);
        var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(call->{
            entered.countDown();assertThat(release.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            return new GroqChatClient.GroqChatResult("""
                {"summary":"부분 관찰","findings":[],"sessionAssessments":[{"sessionId":"S1","judgment":"UNDETERMINED","explanation":"근거 부족","evidenceEventIds":["E1"]}],
                "uncertainties":["부분 관찰"],"usedEvidenceCardIds":[],"practicePlan":{"targetFindingIds":[],"goal":"관찰 연습","rationale":"관찰용 과제","recommendedDifficulty":1,"itemCount":2,
                "quantityComplexity":"LOW","budgetPressure":"LOW","textSupport":"SIMPLIFIED","reasonCodes":["OBSERVATION_PRACTICE"]}}
                ""","mock-qwen");
        });
        java.util.concurrent.Callable<tools.jackson.databind.JsonNode> request=()->{
            var response=mvc.perform(post("/api/behavior-analyses").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andReturn().getResponse();
            return mapper.readTree(response.getContentAsString());
        };
        var first=new java.util.concurrent.FutureTask<>(request);Thread.ofPlatform().start(first);
        assertThat(entered.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        var second=new java.util.concurrent.FutureTask<>(request);var t2=Thread.ofPlatform().start(second);
        var third=new java.util.concurrent.FutureTask<>(request);var t3=Thread.ofPlatform().start(third);
        try{SingleFlightTest.awaitWaiting(t2);SingleFlightTest.awaitWaiting(t3);}finally{release.countDown();}
        var result=first.get(10,java.util.concurrent.TimeUnit.SECONDS);
        assertThat(result.path("status").asString()).isEqualTo("READY");
        assertThat(second.get(10,java.util.concurrent.TimeUnit.SECONDS).path("analysisId")).isEqualTo(result.path("analysisId"));
        assertThat(third.get(10,java.util.concurrent.TimeUnit.SECONDS).path("datasetId")).isEqualTo(result.path("datasetId"));
        verify(client,times(1)).complete(anyString(),anyString(),anyInt(),anyDouble());
    }

    @Test void 서로다른_세션은_사건수가_같아도_같은_스냅샷으로_합치지않는다() {
        var owner=member();UUID s1=UUID.randomUUID(),s2=UUID.randomUUID();log(owner,s1,1);log(owner,s2,1);
        var inputService=context.getBean(oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService.class);
        var first=inputService.createForSession(owner.getId(),null,s1);
        var second=inputService.createForSession(owner.getId(),null,s2);
        assertThat(first.eventCount()).isEqualTo(second.eventCount());
        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(inputService.createForSession(owner.getId(),null,s1).id()).isEqualTo(first.id());
    }
    private UUID log(Member member,UUID sessionId,long sequence) {
        var request = new BehaviorLogRequest(
                new EventMetadata(UUID.randomUUID(), sequence, BehaviorLogService.SUPPORTED_SCHEMA_VERSION, "test", "market-v1", false, null, Instant.now()),
                new IdentityContext(sessionId),
                new TaskContext("MARKET_SIMULATION", UUID.randomUUID(), "market-v1", 2, "BASELINE", EvidenceContext.ASSESSMENT_TASK),
                new ActionContext("SHOP.LIST_OPENED", "LIST", null, StepOutcome.SUCCESS, 1, null, null),
                new AccessibilityContext(InstructionMode.TEXT, TextLevel.STANDARD, false, true, ControllerMode.TOUCH),
                null, null, null, null, null, null, null, null, null,
                mapper.readValue("{\"type\":\"SHOPPING\",\"listOpenCount\":1}", BehaviorPayload.class));
        return logs.record(member.getId(), request).id();
    }
}
