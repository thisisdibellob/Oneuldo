package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.ai.client.GroqChatClient;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class EvidenceAndTimelineTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    @Test void 개발검토된_접근성_카드만_반환하고_없는_인용을_거부한다() {
        assertThat(EvidenceIndex.retrieve("interface").stream().map(c -> c.path("card_id").asString()))
                .containsExactly("I10-C1", "I10-C2");
        assertThat(EvidenceIndex.retrieve("")).isEmpty();
        assertThatThrownBy(() -> EvidenceIndex.validateCitations(List.of("P10-C1"), "interface")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EvidenceIndex.validateCitations(List.of("INVENTED"), "interface")).isInstanceOf(IllegalArgumentException.class);
        EvidenceIndex.validateCitations(List.of("I10-C1"), "interface");
    }
    @Test void 합성24사례는_실사용자나_전문가정답으로_승격되지_않는다() throws Exception {
        try (var stream = getClass().getResourceAsStream("/evidence/synthetic-cases.json")) {
            var cases = mapper.readTree(stream);
            assertThat(cases.size()).isEqualTo(24);
            Set<String> ids = new HashSet<>();
            for (var c : cases) {
                assertThat(ids.add(c.path("case_id").asString())).isTrue();
                assertThat(c.path("synthetic").asBoolean()).isTrue();
                assertThat(c.path("expert_validated").asBoolean()).isFalse();
                assertThat(c.path("alternative_explanations_ko").size()).isPositive();
                assertThat(c.path("must_not_conclude_ko").asString()).isNotBlank();
            }
        }
    }
    @Test void 분할은_모든_사건을_순서대로_한번씩_포함한다() {
        var input = input(12);
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var pipeline = new TimelineAnalysisPipeline(prompts, new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),
                mock(GroqChatClient.class), mapper);
        var single=input(1);
        int limit = new AnalysisTokenBudget().total(prompts.observationSystem(), new AnalysisReferences(mapper, single).encode(prompts.observationPrompt(single,single)),900) + 100;
        var chunks = pipeline.partition(input, limit);
        assertThat(chunks.size()).isGreaterThan(1);
        assertThat(chunks.stream().flatMap(c -> c.input().sessions().stream()).flatMap(s -> s.events().stream())
                .map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList())
                .containsExactlyElementsOf(input.input().sessions().getFirst().events().stream().map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList());
        for (var chunk : chunks) assertThat(new AnalysisTokenBudget().total(prompts.observationSystem(), new AnalysisReferences(mapper, input).encode(prompts.observationPrompt(chunk,input)),900)).isLessThan(limit);
        assertThatThrownBy(() -> pipeline.partition(input, 100)).hasMessageStartingWith("SINGLE_EVENT_EXCEEDS_LIMIT");
    }
    @Test void 구간제한을_늘려도_모든_원본사건을_변경없이_유지한다() {
        var input = input(64);
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var client = mock(GroqChatClient.class);
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var single = input(1);
        int limit = new AnalysisTokenBudget().total(prompts.observationSystem(), new AnalysisReferences(mapper, single).encode(prompts.observationPrompt(single,single)),900) + 100;
        var oldPipeline = new TimelineAnalysisPipeline(prompts, validator, client, mapper, 16);
        assertThatThrownBy(() -> oldPipeline.partition(input, limit)).hasMessage("CHUNK_CALL_BUDGET_EXCEEDED");
        var expanded = new TimelineAnalysisPipeline(prompts, validator, client, mapper, 64);
        var chunks = expanded.partition(input, limit);
        assertThat(chunks).hasSize(64);
        assertThat(chunks.stream().flatMap(c -> c.input().sessions().stream()).flatMap(s -> s.events().stream()).toList())
                .containsExactlyElementsOf(input.input().sessions().getFirst().events());
        for (var chunk : chunks) assertThat(new AnalysisTokenBudget().total(prompts.observationSystem(), new AnalysisReferences(mapper, input).encode(prompts.observationPrompt(chunk,input)),900)).isLessThanOrEqualTo(limit);
        assertThatThrownBy(() -> expanded.partition(input(65), limit)).hasMessage("CHUNK_CALL_BUDGET_EXCEEDED");
        verifyNoInteractions(client);
    }

    @Test void 공급자한도는_재시도하지_않고_감사기록에_남긴다() {
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var client = mock(GroqChatClient.class);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble()))
                .thenThrow(new oneuldo.ai.exception.CloudAiRateLimitException("60", null));
        var pipeline = new TimelineAnalysisPipeline(prompts, new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()), client, mapper);
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(() -> pipeline.analyze(input(1), 60000, audit)).hasMessage("AI_RATE_LIMITED");
        assertThat(audit).hasSize(1);
        assertThat(mapper.writeValueAsString(audit)).contains("AI_RATE_LIMITED");
        verify(client, times(1)).complete(anyString(), anyString(), anyInt(), anyDouble());
    }

    @Test void 구간과_통합에서_같은_짧은_ID를_유지하고_응답은_UUID로_저장한다() {
        var tree = mapper.valueToTree(input(2));
        for (var event : tree.path("input").path("sessions").get(0).path("events"))
            // Distinct source values are required: identical text now correctly factors to one copy.
            ((tools.jackson.databind.node.ObjectNode) event.path("payload").path("marketContent")).put("rawText", event.path("sequence").asString()+"복도 걸음 정지 ".repeat(1500));
        var data = mapper.convertValue(tree, BehaviorAnalysisInputResponse.class);
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var budget = new AnalysisTokenBudget();
        var client = mock(GroqChatClient.class);
        var pacer = mock(AnalysisCallPacer.class);
        var pipeline = new TimelineAnalysisPipeline(prompts, new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()), client, mapper, 64, budget, pacer);
        var chunks = pipeline.partition(data, 18000);
        assertThat(chunks).hasSize(2);
        when(client.complete(anyString(), anyString(), anyInt(), anyDouble())).thenAnswer(invocation -> {
            String wire = invocation.getArgument(1);
            assertThat(budget.total(prompts.systemPrompt(), wire)).isLessThanOrEqualTo(18000);
            String id = wire.contains("구간 2/2") ? "E2" : "E1";
            if (wire.contains("OBSERVE:") || wire.contains("REDUCE:")) return new GroqChatClient.GroqChatResult("""
                    {"summary":"부분 관찰","observations":[{"observation":"사건을 관찰했습니다.","interpretation":"탐색일 수 있습니다.",
                    "alternativeExplanations":["조작 연습일 수 있습니다."],"evidenceEventIds":["%s"]}],"uncertainties":["부분 기록입니다."]}
                    """.formatted(id),"mock-qwen");
            return new GroqChatClient.GroqChatResult("""
                    {"summary":"부분 관찰입니다.","findings":[],"sessionAssessments":[{"sessionId":"S1",
                    "judgment":"UNDETERMINED","explanation":"관찰 범위가 제한됩니다.","evidenceEventIds":["%s"]}],
                    "uncertainties":["전체 수행을 확정할 수 없습니다."],"usedEvidenceCardIds":[],
                    "practicePlan":{"targetFindingIds":[],"goal":"목록 확인 연습","rationale":"관찰용 연습입니다.",
                    "recommendedDifficulty":1,"itemCount":2,"quantityComplexity":"LOW","budgetPressure":"LOW",
                    "textSupport":"SIMPLIFIED","reasonCodes":["OBSERVATION_PRACTICE"]}}
                    """.formatted(id), "mock-qwen");
        });
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result = pipeline.analyze(data, 18000, audit);
        assertThat(result.sessionAssessments().getFirst().sessionId()).isEqualTo(data.input().sessions().getFirst().sessionId());
        assertThat(audit.size()).isBetween(3,4);
        assertThat(audit.get(0).inputPrompt()).contains("\"E1\"").doesNotContain("\"E2\"");
        assertThat(audit.get(1).inputPrompt()).contains("\"E2\"").doesNotContain("\"E1\"");
        assertThat(audit.get(2).inputPrompt()).contains("\"E1\"", "\"E2\"", "chunkAnalyses");
        verifyNoInteractions(pacer); // HTTP client now performs shared token-based admission.
    }

    @Test void 통합은_짧은_출력과_직접_제공된_근거만_허용한다() {
        var input=input(2);
        var events=input.input().sessions().getFirst().events();
        var first=new AiObservationDigest.Observation("이동 기록", "탐색 가능",List.of("조작 연습 가능"),List.of(events.get(0).behaviorLogId()));
        var child=new AiObservationDigest("부분 기록",List.of(first),List.of("인지 여부 미확인"));
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        assertThat(validator.validateReduction(child,input,List.of(child))).isEqualTo(child);
        var uncited=new AiObservationDigest("부분 기록",List.of(new AiObservationDigest.Observation("이동","탐색",List.of("연습"),List.of(events.get(1).behaviorLogId()))),List.of("미확인"));
        assertThatThrownBy(()->validator.validateReduction(uncited,input,List.of(child))).isInstanceOf(IllegalArgumentException.class);
        var verbose=new AiObservationDigest("가".repeat(61),List.of(first),List.of("미확인"));
        assertThat(validator.validateReduction(verbose,input,List.of(child))).isEqualTo(verbose);
        var prompts=new AiBehaviorAnalysisPromptFactory(mapper);
        String saved=mapper.writeValueAsString(Map.of("stage","REDUCE: 통합","chunkAnalyses",List.of(child),"outputContract","old"));
        var revised=mapper.readTree(prompts.compactReductionPrompt(saved));
        assertThat(revised.path("chunkAnalyses")).isEqualTo(mapper.readTree(saved).path("chunkAnalyses"));
        assertThat(revised.path("outputContract").asString()).isEqualTo(prompts.reductionContract());
        assertThatThrownBy(()->prompts.compactReductionPrompt("{\"stage\":\"OBSERVE:\"}")).hasMessage("NOT_REDUCTION_REQUEST");
    }

    @Test void 여러구간을_한번에_통합하고_실패후_검증된단계부터_재개한다() {
        var tree=mapper.valueToTree(input(6));
        for(var event:tree.path("input").path("sessions").get(0).path("events"))
            ((tools.jackson.databind.node.ObjectNode)event.path("payload").path("marketContent")).put("rawText",event.path("sequence").asString()+"복도 걸음 정지 ".repeat(1500));
        var data=mapper.convertValue(tree,BehaviorAnalysisInputResponse.class);
        var prompts=new AiBehaviorAnalysisPromptFactory(mapper);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var client=mock(GroqChatClient.class);
        var cache=new HashMap<String,GroqChatClient.GroqChatResult>();
        AnalysisCheckpoints checkpoints=new AnalysisCheckpoints() {
            public Optional<GroqChatClient.GroqChatResult> find(String s,String p,int o) {return Optional.ofNullable(cache.get(s+p+o));}
            public void save(String s,String p,int o,GroqChatClient.GroqChatResult r) {cache.put(s+p+o,r);}
        };
        var finalCount=new java.util.concurrent.atomic.AtomicInteger();
        var largestBatch=new java.util.concurrent.atomic.AtomicInteger();
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(call->{
            String prompt=call.getArgument(1);var root=mapper.readTree(prompt.substring(0,prompt.lastIndexOf('}')+1));
            String id="E1";
            if(root.path("stage").asString().startsWith("OBSERVE:")) {
                var expanded=new CompactBehaviorTimeline(mapper).decodeWithTables(root.path("behaviorTimeline"));
                id=expanded.path("sessions").get(0).path("events").get(0).path("behaviorLogId").asString();
            } else if(root.path("stage").asString().startsWith("REDUCE:")) largestBatch.set(Math.max(largestBatch.get(),root.path("chunkAnalyses").size()));
            else {
                if(finalCount.getAndIncrement()==0) throw new IllegalStateException("test transport failure");
                return new GroqChatClient.GroqChatResult("""
                    {"summary":"부분 관찰","findings":[],"sessionAssessments":[{"sessionId":"S1","judgment":"UNDETERMINED","explanation":"근거 부족","evidenceEventIds":["E1"]}],
                    "uncertainties":["부분 관찰"],"usedEvidenceCardIds":[],"practicePlan":{"targetFindingIds":[],"goal":"관찰 연습","rationale":"관찰용 과제","recommendedDifficulty":1,"itemCount":2,
                    "quantityComplexity":"LOW","budgetPressure":"LOW","textSupport":"SIMPLIFIED","reasonCodes":["OBSERVATION_PRACTICE"]}}
                    ""","mock");
            }
            return new GroqChatClient.GroqChatResult("""
                {"summary":"부분 관찰","observations":[{"observation":"이동","interpretation":"탐색 가능","alternativeExplanations":["조작 연습"],"evidenceEventIds":["%s"]}],"uncertainties":["의도 불명"]}
                """.formatted(id),"mock");
        });
        var first=new TimelineAnalysisPipeline(prompts,validator,client,mapper).withCheckpoints(checkpoints);
        assertThat(first.partition(data,18000)).hasSize(6);
        assertThatThrownBy(()->first.analyze(data,18000,new ArrayList<>())).hasMessage("AI_UNAVAILABLE");
        assertThat(largestBatch.get()).isEqualTo(6);
        assertThat(cache).hasSize(7);
        clearInvocations(client);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result=new TimelineAnalysisPipeline(prompts,validator,client,mapper).withCheckpoints(checkpoints).analyze(data,18000,audit);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("UNDETERMINED");
        assertThat(audit.stream().filter(a->"CHECKPOINT".equals(a.source())).count()).isEqualTo(7);
        verify(client,times(1)).complete(anyString(),anyString(),anyInt(),anyDouble());
    }

    private BehaviorAnalysisInputResponse input(int count) {
        UUID dataset = UUID.randomUUID(), session = UUID.randomUUID();
        var now = Instant.parse("2026-09-05T00:00:00Z");
        List<BehaviorAnalysisInput.EventTimeline> events = new ArrayList<>();
        for (int i=0; i<count; i++) events.add(mapper.readValue("{\"behaviorLogId\":\"" + UUID.randomUUID()
                + "\",\"sequence\":"+(i+1)+",\"elapsedFromSessionStartMs\":0,\"payload\":{\"type\":\"SHOPPING\",\"marketContent\":{\"rawText\":\""+i+"x".repeat(1500)+"\"}}}", BehaviorAnalysisInput.EventTimeline.class));
        var data = new BehaviorAnalysisInput("test", dataset, now, new BehaviorAnalysisInput.AnalysisWindow(now,now),
                "anonymous", 1,count,List.of(new BehaviorAnalysisInput.SessionTimeline(session,now,now,null,events)));
        return new BehaviorAnalysisInputResponse(dataset,"test",now,1,count,data);
    }
}
