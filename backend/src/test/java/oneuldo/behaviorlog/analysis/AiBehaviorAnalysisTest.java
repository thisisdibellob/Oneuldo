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
    private final GroqChatClient client = mock(GroqChatClient.class, inv -> inv.getMethod().getName().equals("completeDigest")
                ? inv.callRealMethod() : org.mockito.Answers.RETURNS_DEFAULTS.answer(inv));
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

    @Test void 부분관찰의_구간밖_근거는_정확한_경로와_별칭으로_보고한다() {
        var digest = new AiObservationDigest("관찰", List.of(new AiObservationDigest.Observation(
                "수량 변경", "기록된 조작", List.of(), List.of(eventId))), List.of("동기는 미확인"));
        assertThat(validator.validateDigest(digest, input(true))).isSameAs(digest);
        var failure = catchThrowableOfType(ReviewEvidenceException.class,
                () -> validator.validateDigest(digest, input(false)));
        assertThat(failure.details().code()).isEqualTo("DIGEST_EVIDENCE_OUTSIDE_CHUNK");
        assertThat(failure.details().path()).isEqualTo("observations[0].evidenceEventIds");
        assertThat(failure.details().offendingIds()).containsExactly(eventId.toString());
        var refs = new AnalysisReferences(mapper, input(true));
        var feedback = mapper.readTree(refs.encode(mapper.writeValueAsString(failure.details())));
        assertThat(feedback.path("offendingIds").get(0).asString()).isEqualTo("E1");
        assertThat(feedback.toString()).doesNotContain(eventId.toString());
    }

    @Test void 부분관찰_재시도는_구간밖_별칭을_알리고_모델이_낸_자료한계를_보존한다() {
        var refs = new AnalysisReferences(mapper,input(true));
        var pipeline = new TimelineAnalysisPipeline(prompts,validator,client,mapper,64,budget,new AnalysisCallPacer());
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(
                new GroqChatClient.GroqChatResult("{\"summary\":\"구간\",\"observations\":[{\"observation\":\"없음\",\"interpretation\":\"미확인\",\"alternativeExplanations\":[],\"evidenceEventIds\":[\"E1\"]}],\"uncertainties\":[]}","test"),
                new GroqChatClient.GroqChatResult("{\"summary\":\"구간\",\"observations\":[],\"uncertainties\":[\"이 구간에는 선택 기록이 없음\"]}","test"));
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        java.util.function.Function<String,AiObservationDigest> parse = raw -> ReflectionTestUtils.invokeMethod(
                pipeline,"validateDigestReferences",refs.readDigest(raw),input(false),refs);
        AiObservationDigest result = ReflectionTestUtils.invokeMethod(pipeline,"callDigest",prompts.observationSystem(),"{}",900,12000,audit,parse);
        assertThat(result.observations()).isEmpty();
        assertThat(result.uncertainties()).containsExactly("이 구간에는 선택 기록이 없음");
        assertThat(audit).hasSize(2);
        assertThat(audit.getFirst().validationFailure().offendingIds()).containsExactly("E1");
        assertThat(audit.get(1).inputPrompt()).contains("DIGEST_EVIDENCE_OUTSIDE_CHUNK","observations[0].evidenceEventIds","E1","무관한 구간 안 ID로 치환하지").doesNotContain(eventId.toString());
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
    }

    @Test
    void AI검토가_초안을_정정하면_검토결과를_보존한다() {
        ReflectionTestUtils.setField(service, "qualityReview", true);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("SUCCESS")), "test-model"))
                .thenReturn(new GroqChatClient.GroqChatResult(reviewed(valid("UNDETERMINED")), "test-model"));
        var response = service.analyze(memberId, new BehaviorAnalysisInputRequest(null, null));
        assertThat(response.status()).isEqualTo("READY");
        assertThat(response.analysis().sessionAssessments().getFirst().judgment()).isEqualTo("UNDETERMINED");
        verify(client).complete(eq(AnalysisReviewPrompt.system()), contains("reviewSourcePolicy"), anyInt(), anyDouble());
        verify(repository).save(argThat(run -> run.getAttempts().size()==2
                && run.getAttempts().get(1).inputPrompt().contains("behaviorTimeline")
                && run.getAttempts().get(1).inputPrompt().contains("SUCCESS")));
    }

    @Test void 같은_사건의_추가설명은_재시도없이_READY로_저장한다() {
        ReflectionTestUtils.setField(service,"qualityReview",true);
        var review=mapper.readTree(reviewed(valid("UNDETERMINED")));
        ((tools.jackson.databind.node.ArrayNode)review.path("analysis").path("findings").get(0).path("observation"))
                .add(claim("변경 후 수량은 2개였다."));
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("SUCCESS")),"test-model"))
                .thenReturn(new GroqChatClient.GroqChatResult(review.toString(),"test-model"));
        var response=service.analyze(memberId,new BehaviorAnalysisInputRequest(null,null));
        assertThat(response.status()).isEqualTo("READY");
        assertThat(response.analysis().findings().getFirst().observation())
                .contains("수량을 1에서 2로 변경했다.","변경 후 수량은 2개였다.");
        assertThat(response.analysis().findings().getFirst().evidenceEventIds()).containsExactly(eventId);
        verify(client,times(2)).complete(anyString(),anyString(),anyInt(),anyDouble());
        verify(repository).save(argThat(run->run.getStatus().equals("READY") && run.getAttempts().size()==2
                && run.getAttempts().get(1).rawOutput().equals(review.toString())));
    }

    @Test void 문장내_중복은_오류정보와_교정지시를_전달한_뒤_재시도한다() {
        ReflectionTestUtils.setField(service,"qualityReview",true);
        var invalid=mapper.readTree(reviewed(valid("UNDETERMINED")));
        ((tools.jackson.databind.node.ArrayNode)invalid.path("analysis").path("findings").get(0)
                .path("observation").get(0).path("evidenceEventIds")).add("E1");
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("SUCCESS")),"test-model"))
                .thenReturn(new GroqChatClient.GroqChatResult(invalid.toString(),"test-model"))
                .thenReturn(new GroqChatClient.GroqChatResult(reviewed(valid("UNDETERMINED")),"test-model"));
        var response=service.analyze(memberId,new BehaviorAnalysisInputRequest(null,null));
        assertThat(response.status()).isEqualTo("READY");
        verify(repository).save(argThat(run->run.getAttempts().size()==3
                && run.getAttempts().get(1).validationFailure().code().equals("DUPLICATE_REVIEW_EVIDENCE")
                && run.getAttempts().get(2).inputPrompt().contains("그 배열의 중복을 제거하세요")
                && run.getAttempts().get(2).inputPrompt().contains("문장 사이에서는 직전 문장의 마지막 사건을 다시 인용할 수 있습니다")));
    }

    @Test void 검토는_원본과_관찰을_보존하면서_중간단계의_추측을_반복주입하지않는다() {
        var data=input(true);var refs=new AnalysisReferences(mapper,data);
        var digest=new AiObservationDigest("구간",List.of(new AiObservationDigest.Observation(
                "수량 1에서 2 변경", "중간 단계의 의도 추측", List.of("중간 단계의 우연한 조작 추측"), List.of(eventId))),List.of("동기는 미확인"));
        String source=AnalysisSynthesisPrompt.build(mapper,prompts,data,List.of(digest),refs,false);
        var review=mapper.readTree(AnalysisReviewPrompt.build(mapper,source,valid("SUCCESS"),refs));
        var fact=review.path(SourceEventDetails.FIELD).get(0);
        assertThat(fact.path("id").asString()).isEqualTo("E1");
        assertThat(fact.path("quantityBefore").asInt()).isEqualTo(1);
        assertThat(fact.path("quantityAfter").asInt()).isEqualTo(2);
        var context=review.path("chunkAnalyses").get(0);
        assertThat(context.path("observations").isEmpty()).isTrue();
        assertThat(review.path("rawBackedObservationsNotRepeated").asInt()).isEqualTo(1);
        assertThat(context.path("localLimitationsToRecheck").get(0).asString()).isEqualTo("동기는 미확인");
        assertThat(context.toString()).doesNotContain("중간 단계의 의도 추측", "중간 단계의 우연한 조작 추측");
        assertThat(review.has("draftToReview")).isFalse();
        // Independent review input is unchanged when only the previous verdict changes.
        assertThat(AnalysisReviewPrompt.build(mapper,source,valid("FAILURE"),refs)).isEqualTo(review.toString());
        assertThat(new LosslessTables(mapper).decode(review).path("taskContext"))
                .isEqualTo(new LosslessTables(mapper).decode(mapper.readTree(source)).path("taskContext"));
        assertThat(digest.observations().getFirst().alternativeExplanations()).containsExactly("중간 단계의 우연한 조작 추측");
    }

    @Test void 독립검토는_원본이_없는_이동관찰과_부분적으로만_있는_관찰을_보존한다() {
        var data=input(true);var refs=new AnalysisReferences(mapper,data);
        var source=mapper.createObjectNode();
        source.putArray(SourceEventDetails.FIELD).addObject().put("id","E1").put("quantityAfter",2);
        var chunk=source.putArray("chunkAnalyses").addObject();
        chunk.putArray("uncertainties").add("이동 이유 미확인");
        var observations=chunk.putArray("observations");
        var covered=observations.addObject().put("observation","수량 변경");
        covered.putArray("evidenceEventIds").add("E1");
        var movement=observations.addObject().put("observation","계산대 쪽으로 이동");
        movement.putArray("evidenceEventIds").add("E2");
        var mixed=observations.addObject().put("observation","변경 후 이동");
        mixed.putArray("evidenceEventIds").add("E1").add("E2");
        var review=mapper.readTree(AnalysisReviewPrompt.build(mapper,source.toString(),valid("SUCCESS"),refs));
        assertThat(review.path(SourceEventDetails.FIELD)).isEqualTo(source.path(SourceEventDetails.FIELD));
        assertThat(review.path("rawBackedObservationsNotRepeated").asInt()).isEqualTo(1);
        var retained=review.path("chunkAnalyses").get(0).path("observations");
        assertThat(retained.size()).isEqualTo(2);
        assertThat(retained.get(0)).isEqualTo(movement);
        assertThat(retained.get(1)).isEqualTo(mixed);
    }

    @Test
    void AI검토_연결실패는_검토하지않은_초안을_READY로_내보내지않는다() {
        ReflectionTestUtils.setField(service, "qualityReview", true);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("SUCCESS")), "test-model"))
                .thenThrow(new oneuldo.ai.exception.CloudAiUnavailableException("test"));
        var response=service.analyze(memberId,new BehaviorAnalysisInputRequest(null,null));
        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.analysis()).isNull();
        verify(repository).save(argThat(run -> run.getAttempts().size()==2 && run.getAttempts().getFirst().rawOutput()!=null));
    }

    @Test
    void 검토만_실패하면_저장된_초안부터_재개한다() {
        var cache=new HashMap<String,GroqChatClient.GroqChatResult>();
        AnalysisCheckpoints store=new AnalysisCheckpoints() {
            public Optional<GroqChatClient.GroqChatResult> find(String s,String p,int o) {return Optional.ofNullable(cache.get(s+p+o));}
            public void save(String s,String p,int o,GroqChatClient.GroqChatResult r) {cache.put(s+p+o,r);}
        };
        var draft=new GroqChatClient.GroqChatResult(mapper.writeValueAsString(valid("SUCCESS")),"test-model");
        var reviewed=new GroqChatClient.GroqChatResult(reviewed(valid("UNDETERMINED")),"test-model");
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble()))
                .thenReturn(draft).thenThrow(new oneuldo.ai.exception.CloudAiUnavailableException("test")).thenReturn(reviewed);
        var first=new TimelineAnalysisPipeline(prompts,validator,client,mapper,64,budget,new AnalysisCallPacer())
                .withQualityReview(true).withCheckpoints(store);
        assertThatThrownBy(()->first.analyze(input(true),12000,new ArrayList<>())).hasMessage("AI_UNAVAILABLE");
        assertThat(cache).hasSize(1);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result=new TimelineAnalysisPipeline(prompts,validator,client,mapper,64,budget,new AnalysisCallPacer())
                .withQualityReview(true).withCheckpoints(store).analyze(input(true),12000,audit);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("UNDETERMINED");
        assertThat(audit).extracting(AiBehaviorAnalysisRun.Attempt::source).containsExactly("CHECKPOINT","LIVE");
        verify(client,times(3)).complete(anyString(),anyString(),anyInt(),anyDouble());
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

    @Test void transport_failure_is_auditable_and_does_not_become_a_player_judgment() {
        var details=new oneuldo.ai.exception.AiTransportException.Details("request-1","CONNECT","HttpConnectTimeoutException",null,3,45000);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenThrow(
                new oneuldo.ai.exception.AiTransportException(oneuldo.ai.exception.AiTransportException.Code.AI_CONNECT_TIMEOUT,details,null));
        var response=service.analyze(memberId,new BehaviorAnalysisInputRequest(null,null));
        assertThat(response.errorCode()).isEqualTo("AI_CONNECT_TIMEOUT");assertThat(response.analysis()).isNull();
        verify(repository).save(argThat(run->details.equals(run.getAttempts().getFirst().transportFailure())
                && run.getAttempts().getFirst().latencyMs()!=null));
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

    private String reviewed(AiBehaviorAnalysis analysis) {
        var tree=(tools.jackson.databind.node.ObjectNode)mapper.valueToTree(analysis);
        tree.putArray("summary").add(claim(analysis.summary()));
        for(var finding:tree.path("findings")) {
            var f=(tools.jackson.databind.node.ObjectNode)finding;
            f.remove("evidenceEventIds");
            f.putArray("observation").add(claim("수량을 1에서 2로 변경했다."));
            var interpretation=claim(f.path("interpretation").asString());
            f.putArray("interpretation").add(interpretation);
            var old=f.path("alternativeExplanations").deepCopy();
            var alternatives=f.putArray("alternativeExplanations");
            old.forEach(text->alternatives.add(claim(text.asString())));
        }
        for(var assessment:tree.path("sessionAssessments")) {
            var a=(tools.jackson.databind.node.ObjectNode)assessment;
            a.remove("evidenceEventIds");var explanation=claim(a.path("explanation").asString());
            a.putArray("explanation").add(explanation);
        }
        return mapper.writeValueAsString(Map.of("reviewFormat",ReviewedClaimOutput.FORMAT,"reviewNotes",List.of(),"analysis",tree));
    }
    private tools.jackson.databind.JsonNode claim(String text) {
        return mapper.valueToTree(Map.of("text",text,"evidenceEventIds",List.of("E1")));
    }

    @Test void 근거없는_대안을_채우지않아도_분석과_요약이_통과하고_null은_거부한다() {
        var tree=(tools.jackson.databind.node.ObjectNode)mapper.valueToTree(valid("UNDETERMINED"));
        var finding=(tools.jackson.databind.node.ObjectNode)tree.path("findings").get(0);
        finding.putArray("alternativeExplanations");
        var analysis=mapper.convertValue(tree,AiBehaviorAnalysis.class);
        assertThat(validator.validate(analysis,input(true))).isSameAs(analysis);
        var digest=new AiObservationDigest("수량 변경",List.of(new AiObservationDigest.Observation(
                "1→2", "동기 미확인", List.of(), List.of(eventId))),List.of("동기 미확인"));
        assertThat(validator.validateReduction(digest,input(true),List.of(digest))).isSameAs(digest);
        finding.putNull("alternativeExplanations");
        assertThatThrownBy(()->validator.validate(mapper.convertValue(tree,AiBehaviorAnalysis.class),input(true)))
                .hasMessage("INVALID_ANALYSIS_CONTRACT");
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
