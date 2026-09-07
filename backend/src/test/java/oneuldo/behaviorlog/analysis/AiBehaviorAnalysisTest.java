package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.AiBehaviorAnalysisRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class AiBehaviorAnalysisTest {
    private final ObjectMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final BehaviorAnalysisInputService inputs = mock(BehaviorAnalysisInputService.class);
    private final AiBehaviorAnalysisRepository repository = mock(AiBehaviorAnalysisRepository.class);
    private final GroqChatClient client = mock(GroqChatClient.class);
    private final AiBehaviorAnalysisPromptFactory prompts = new AiBehaviorAnalysisPromptFactory(mapper);
    private final AiBehaviorAnalysisValidator validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
    private final AnalysisTokenBudget budget = new AnalysisTokenBudget();
    private final AiBehaviorAnalysisService service = new AiBehaviorAnalysisService(inputs, repository, prompts, validator, client, mapper, budget,
            mock(AnalysisCallPacer.class), mock(oneuldo.behaviorlog.profile.service.AiUserProfileService.class));
    private final UUID memberId = UUID.randomUUID();
    private final UUID datasetId = UUID.randomUUID();
    private final UUID sessionId = UUID.randomUUID();
    private final UUID eventId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        // These mock-provider tests exercise response contracts, not the real free-account quota.
        ReflectionTestUtils.setField(budget, "requestTokens", 12000);
        var fixture = input(true);
        when(inputs.create(eq(memberId), any())).thenReturn(fixture);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void 모든_사건을_보존하고_판정필드만_입력에서_분리한다() {
        var input = input(true);
        var tree = mapper.readTree(prompts.userPrompt(input));
        var events = new CompactBehaviorTimeline(mapper).decodeWithTables(tree.path("behaviorTimeline")).path("sessions").get(0).path("events");
        assertThat(events.size()).isEqualTo(1);
        var event = events.get(0);
        assertThat(event.path("behaviorLogId").asString()).isEqualTo(eventId.toString());
        assertThat(event.path("payload").path("x").asDouble()).isEqualTo(123.5);
        assertThat(event.path("payload").path("quantityBefore").asInt()).isEqualTo(1);
        assertThat(event.path("payload").path("quantityAfter").asInt()).isEqualTo(2);
        assertThat(event.has("normalization")).isFalse();
        assertThat(event.path("action").has("stepOutcome")).isFalse();
        assertThat(event.path("taskResult").has("taskCompleted")).isFalse();
        assertThat(event.path("payload").has("pathEfficiency")).isFalse();
        assertThat(event.path("taskResult").path("completionTimeMs").asLong()).isEqualTo(9000);
        assertThat(input.input().sessions().getFirst().events().getFirst().taskResult().taskCompleted()).isTrue();
        assertThat(tree.path("excludedLegacyFields").toString()).contains("action.stepOutcome");
    }

    @Test
    void 원본_성공라벨과_달라도_AI의_실패판정을_그대로_보존한다() {
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("FAILURE")), "test-model"));
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("READY");
        assertThat(response.analysis().sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(response.evidenceVersion()).isEqualTo(EvidenceIndex.VERSION);
        verify(repository).save(argThat(run -> run.getSystemPrompt().contains("지적장애")
                && run.getAttempts().size() == 1 && run.getInputPrompt().contains("E1")
                && !run.getInputPrompt().contains(eventId.toString())));
    }

    @Test
    void 일치하는_버전만_카탈로그를_붙이고_과거사건은_덮어쓰지_않는다() {
        var inputTree = mapper.valueToTree(input(true));
        var payload = (tools.jackson.databind.node.ObjectNode) inputTree.path("input").path("sessions").get(0).path("events").get(0).path("payload");
        payload.put("catalogVersion", "old-catalog");
        payload.put("priceAmount", 999);
        var historical = mapper.convertValue(inputTree, BehaviorAnalysisInputResponse.class);
        var oldPrompt = mapper.readTree(prompts.userPrompt(historical));
        assertThat(oldPrompt.path("matchingContentCatalog").isEmpty()).isTrue();
        assertThat(new CompactBehaviorTimeline(mapper).decodeWithTables(oldPrompt.path("behaviorTimeline")).path("sessions").get(0).path("events").get(0).path("payload").path("priceAmount").asInt()).isEqualTo(999);
        payload.put("catalogVersion", oneuldo.behaviorlog.personalization.service.MarketQuestCatalog.VERSION);
        var currentPrompt = mapper.readTree(prompts.userPrompt(mapper.convertValue(inputTree, BehaviorAnalysisInputResponse.class)));
        assertThat(new LosslessTables(mapper).decode(currentPrompt).path("matchingContentCatalog").path("products").size()).isEqualTo(60);
    }

    @Test
    void 존재하지_않는_근거와_다른_세션_근거는_거부한다() {
        var valid = valid("UNDETERMINED");
        var finding = valid.findings().getFirst();
        var fabricated = new AiBehaviorAnalysis(valid.summary(), List.of(new AiBehaviorAnalysis.Finding(
                finding.id(), finding.skill(), finding.observation(), finding.interpretation(), finding.alternativeExplanations(),
                List.of(UUID.randomUUID()), finding.suggestedSupport())), valid.sessionAssessments(), valid.uncertainties(), valid.practicePlan());
        assertThatThrownBy(() -> validator.validate(fabricated, input(true))).isInstanceOf(IllegalArgumentException.class);
        var wrongSession = new AiBehaviorAnalysis(valid.summary(), valid.findings(),
                List.of(new AiBehaviorAnalysis.SessionAssessment(UUID.randomUUID(), "SUCCESS", "설명", List.of(eventId))),
                valid.uncertainties(), valid.practicePlan());
        assertThatThrownBy(() -> validator.validate(wrongSession, input(true))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void 짧은_ID를_복원하고_만들어낸_ID와_타입혼동은_거부한다() {
        var refs = new AnalysisReferences(mapper, input(true));
        String raw = mapper.writeValueAsString(valid("UNDETERMINED"))
                .replace(eventId.toString(), "E1").replace(sessionId.toString(), "S1");
        var restored = validator.validate(refs.read(raw), input(true));
        assertThat(restored.findings().getFirst().evidenceEventIds()).containsExactly(eventId);
        assertThat(restored.sessionAssessments().getFirst().sessionId()).isEqualTo(sessionId);
        assertThatThrownBy(() -> refs.read(raw.replace("E1", "E999"))).hasMessage("UNKNOWN_ANALYSIS_REFERENCE");
        assertThatThrownBy(() -> refs.read(raw.replace("E1", "S1"))).hasMessage("UNKNOWN_ANALYSIS_REFERENCE");
        assertThatThrownBy(() -> refs.read(raw + " {}" )).isInstanceOf(RuntimeException.class);
    }

    @Test void 단계별_출력예산으로_작은_관측은_무료계정_예산에_들어간다() {
        ReflectionTestUtils.setField(budget, "requestTokens", 7000);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("UNDETERMINED")), "mock-qwen"));
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("READY");
        verify(client).complete(anyString(), anyString(), eq(900), anyDouble());
    }

    @Test
    void 형식실패는_한번만_재시도하고_복구한다() {
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult("not-json", "test-model"),
                        new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("UNDETERMINED")), "test-model"));
        assertThat(service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null)).status()).isEqualTo("READY");
        verify(client, times(2)).complete(anyString(), anyString(), anyInt(), anyDouble());
        verify(repository).save(argThat(run -> run.getAttempts().size() == 2
                && "INVALID_AI_ANALYSIS".equals(run.getAttempts().getFirst().errorCode())));
    }

    @Test
    void 두번_형식실패해도_서버_판정을_만들지_않는다() {
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult("{}", "test-model"));
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.analysis()).isNull();
        verify(client, times(2)).complete(anyString(), anyString(), anyInt(), anyDouble());
    }

    @Test
    void API오류는_사용자실패가_아니고_대체판정도_없다() {
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble())).thenThrow(new IllegalStateException("provider unavailable"));
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.errorCode()).isEqualTo("AI_UNAVAILABLE");
        assertThat(response.analysis()).isNull();
        verify(client, times(1)).complete(anyString(), anyString(), anyInt(), anyDouble());
    }

    @Test
    void 기록없음과_입력초과는_모델을_호출하지_않는다() {
        when(inputs.create(eq(memberId), any())).thenReturn(input(false));
        assertThat(service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null)).status()).isEqualTo("NO_HISTORY");
        when(inputs.create(eq(memberId), any())).thenReturn(input(true));
        ReflectionTestUtils.setField(budget, "requestTokens", 901);
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("INPUT_TOO_LARGE");
        assertThat(response.eventCount()).isEqualTo(1);
        assertThat(response.analysis()).isNull();
        verifyNoInteractions(client);
    }

    @Test
    void 다른_사용자의_분석은_조회할_수_없다() {
        UUID analysisId = UUID.randomUUID();
        when(repository.findByIdAndMemberId(analysisId, memberId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.find(memberId, analysisId)).isInstanceOf(ResponseStatusException.class);
        verify(repository).findByIdAndMemberId(analysisId, memberId);
    }

    @Test
    void 계약에_없는_능력점수_추가는_거부한다() {
        var json = mapper.valueToTree(valid("SUCCESS"));
        ((tools.jackson.databind.node.ObjectNode) json).put("iq", 50);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(json.toString(), "test-model"));
        assertThat(service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null)).status()).isEqualTo("FAILED");
    }

    @Test
    void 재분석은_소유한_기존스냅샷만_사용한다() {
        when(inputs.find(memberId, datasetId)).thenReturn(input(true));
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("UNDETERMINED")), "test-model"));
        var response = service.analyzeSnapshot(memberId, datasetId);
        assertThat(response.status()).isEqualTo("READY");
        assertThat(response.datasetId()).isEqualTo(datasetId);
        verify(inputs).find(memberId, datasetId);
        verify(inputs, never()).create(any(), any());
    }

    @Test
    void 소유하지_않은_스냅샷은_AI호출전에_거부한다() {
        when(inputs.find(memberId, datasetId)).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.analyzeSnapshot(memberId, datasetId)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(client, repository);
    }

    private AiBehaviorAnalysis valid(String judgment) {
        return new AiBehaviorAnalysis("목록과 수량을 살펴보았습니다.",
                List.of(new AiBehaviorAnalysis.Finding("F1", "수량 확인", "수량을 1에서 2로 바꿨습니다.",
                        "목표 수량을 확인했을 가능성이 있습니다.", List.of("조작 연습일 수도 있습니다."), List.of(eventId), "수량을 함께 읽어 봅니다.")),
                List.of(new AiBehaviorAnalysis.SessionAssessment(sessionId, judgment, "목표와 사건을 비교한 AI의 해석입니다.", List.of(eventId))),
                List.of("실생활 수행은 알 수 없습니다."),
                new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "목록과 수량 비교 연습", "수량 변경 관찰에 따른 연습",
                        1, 2, "LOW", "LOW", "SIMPLIFIED", List.of("QUANTITY_PRACTICE")));
    }

    private BehaviorAnalysisInputResponse input(boolean hasEvents) {
        var event = mapper.readValue("""
                {"behaviorLogId":"%s","sequence":1,"elapsedFromSessionStartMs":0,"occurredAt":"2026-09-04T01:00:00Z",
                 "action":{"eventCode":"SHOP.QUANTITY_CHANGED","stepOutcome":"SUCCESS"},
                 "taskResult":{"taskCompleted":true,"completionQuality":100,"completionTimeMs":9000},
                 "payload":{"type":"SHOPPING","x":123.5,"y":99,"quantityBefore":1,"quantityAfter":2,"pathEfficiency":0.2}}
                """.formatted(eventId), BehaviorAnalysisInput.EventTimeline.class);
        var now = Instant.parse("2026-09-04T01:00:00Z");
        var data = new BehaviorAnalysisInput("test-v1", datasetId, now,
                new BehaviorAnalysisInput.AnalysisWindow(now, now), "anonymous", hasEvents ? 1 : 0, hasEvents ? 1 : 0,
                hasEvents ? List.of(new BehaviorAnalysisInput.SessionTimeline(sessionId, now, now, null, List.of(event))) : List.of());
        return new BehaviorAnalysisInputResponse(datasetId, "test-v1", now, data.sessionCount(), data.eventCount(), data);
    }
}
