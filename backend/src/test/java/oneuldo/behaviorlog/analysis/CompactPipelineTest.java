package oneuldo.behaviorlog.analysis;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CompactPipelineTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final MovementProjectionTest fixture=new MovementProjectionTest();
    final AiBehaviorAnalysisPromptFactory prompts=new AiBehaviorAnalysisPromptFactory(mapper);
    final AiBehaviorAnalysisValidator validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
    final String finalJson="""
        {"s":"좌표 이동 관측","f":[["F1","이동","좌표가 바뀜","탐색 가능성",["조작 연습 가능"],["E1"],"목표 함께 확인"]],
        "a":[["S1","UNDETERMINED","완료 근거 부족",["E1"]]],"u":["요약만으로 판단 제한"],
        "p":[["F1"],"목표 확인","이동 관찰과 연결",1,2,"LOW","LOW","SIMPLIFIED",["OBSERVATION_PRACTICE"]],"c":[]}
        """;

    @Test void review_retry_receives_exact_unknown_reference_and_audit_keeps_both_failures() {
        var input=fixture.input(fixture.fixture());
        var review=new ReviewedClaimOutputTest().envelope();
        ((tools.jackson.databind.node.ObjectNode)review.path("analysis").path("findings").get(0)
                .path("observation").get(1)).putArray("evidenceEventIds").add("E999");
        var client=mock(GroqChatClient.class);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble()))
                .thenReturn(new GroqChatClient.GroqChatResult(finalJson,"test"))
                .thenReturn(new GroqChatClient.GroqChatResult(review.toString(),"test"));
        var budget=new AnalysisTokenBudget();
        org.springframework.test.util.ReflectionTestUtils.setField(budget,"requestTokens",18000);
        org.springframework.test.util.ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(()->new TimelineAnalysisPipeline(prompts,validator,client,mapper,64,budget,new AnalysisCallPacer())
                .withQualityReview(true).analyze(input,18000,audit)).hasMessage("INVALID_AI_ANALYSIS");
        assertThat(audit).hasSize(3);
        for(var attempt:audit.subList(1,3)) {
            assertThat(attempt.validationFailure().code()).isEqualTo("UNKNOWN_REVIEW_EVIDENCE");
            assertThat(attempt.validationFailure().path()).isEqualTo("/findings/0/observation/1");
            assertThat(attempt.validationFailure().offendingIds()).containsExactly("E999");
            var restored=mapper.readValue(mapper.writeValueAsString(attempt),AiBehaviorAnalysisRun.Attempt.class);
            assertThat(restored.validationFailure()).isEqualTo(attempt.validationFailure());
        }
        assertThat(audit.get(2).inputPrompt()).contains("\"code\":\"UNKNOWN_REVIEW_EVIDENCE\"", "\"offendingIds\":[\"E999\"]");
        var legacy=(tools.jackson.databind.node.ObjectNode)mapper.valueToTree(audit.get(1));
        legacy.remove("validationFailure");
        assertThat(mapper.convertValue(legacy,AiBehaviorAnalysisRun.Attempt.class).validationFailure()).isNull();
    }

    @Test void synthesis_does_not_reattach_raw_scene_and_restores_compact_result() {
        var input=fixture.input(fixture.fixture());var refs=new AnalysisReferences(mapper,input);
        var source=input.input().sessions().getFirst().events().getFirst().behaviorLogId();
        var digest=new AiObservationDigest("요약",List.of(new AiObservationDigest.Observation("사실","가설",List.of("대안"),List.of(source))),List.of("한계"));
        String prompt=AnalysisSynthesisPrompt.build(mapper,prompts,input,List.of(digest),refs,false);
        assertThat(prompt).doesNotContain("behaviorTimeline","sceneSnapshot");
        assertThat(QwenTokenCounter.inputTokens(FinalAnalysisPromptCompactor.systemPrompt(),prompt)+900).isLessThan(7000);
        assertThat(validator.validate(refs.read(finalJson),input).findings().getFirst().evidenceEventIds()).containsExactly(source);
        assertThatThrownBy(()->refs.read(finalJson.replace("E1","E999"))).hasMessage("UNKNOWN_ANALYSIS_REFERENCE");
    }

    @Test void largerContextReadsAllSourcesInOneCallWithoutDigest() {
        var input=fixture.input(fixture.fixture());
        var client=mock(GroqChatClient.class);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(finalJson,"test"));
        var budget=new AnalysisTokenBudget();
        org.springframework.test.util.ReflectionTestUtils.setField(budget,"requestTokens",18000);
        org.springframework.test.util.ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
        var result=new TimelineAnalysisPipeline(prompts,validator,client,mapper,64,budget,new AnalysisCallPacer()).analyze(input,18000,new ArrayList<>());
        assertThat(result.summary()).isEqualTo("좌표 이동 관측");
        var prompt=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(client).complete(anyString(),prompt.capture(),eq(1800),anyDouble());
        verify(client,never()).completeDigest(anyString(),anyString(),anyInt(),anyDouble());
        var root=new LosslessTables(mapper).decode(mapper.readTree(prompt.getValue()));
        assertThat(root.has("chunkAnalyses")).isFalse();
        var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
        int count=0;for(var session:timeline.path("sessions"))count+=session.path("events").size();
        assertThat(count).isEqualTo(input.eventCount());
    }

    @Test void output_truncation_splits_only_failed_observation_and_reports_progress() throws Exception {
        var rawInput=fixture.fixture();
        ((tools.jackson.databind.node.ObjectNode)rawInput.path("input").path("sessions").get(0).path("events").get(0)).put("appVersion","x".repeat(70000));
        var input=fixture.input(rawInput);var client=mock(GroqChatClient.class, inv -> inv.getMethod().getName().equals("completeDigest")
                ? inv.callRealMethod() : org.mockito.Answers.RETURNS_DEFAULTS.answer(inv));var calls=new AtomicInteger();
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenAnswer(inv->{
            String prompt=inv.getArgument(1);
            if(prompt.contains("synthesisVersion"))return new GroqChatClient.GroqChatResult(finalJson,"test");
            if(calls.incrementAndGet()<=2)return new GroqChatClient.GroqChatResult("{","test","length",100,900,1L);
            var root=new LosslessTables(mapper).decode(mapper.readTree(prompt.split("\n구간 ")[0]));
            var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
            var first=timeline.path("sessions").get(0).path("events").get(0).path("behaviorLogId").asString();
            return new GroqChatClient.GroqChatResult("{\"s\":\"관측\",\"o\":[[\"이동\",\"탐색 가설\",[\"조작 연습\"],[\""+first+"\"]]],\"u\":[\"구간 한계\"]}","test");
        });
        var progress=new ArrayList<AnalysisProgress.Update>();
        try(var ignored=AnalysisProgress.bind(progress::add)) {
            var result=new TimelineAnalysisPipeline(prompts,validator,client,mapper).analyze(input,7000,new ArrayList<>());
            assertThat(result.summary()).isEqualTo("좌표 이동 관측");
        }
        assertThat(progress).anyMatch(p->"OBSERVING".equals(p.stage())&&p.completed()==2&&p.total()==2);
        verify(client,times(5)).complete(anyString(),anyString(),anyInt(),anyDouble());
    }
}
