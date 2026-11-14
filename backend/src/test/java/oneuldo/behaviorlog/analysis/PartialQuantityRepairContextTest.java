package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PartialQuantityRepairContextTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    ObjectNode source() {
        return (ObjectNode)m.readTree("""
            {"concretePracticeDesignVersion":"practice-design-v1",
             "practiceProductSources":[{"productId":"milk","name":"흰 우유"}],
             "sessionSourceLedger":[{"sessionId":"S1",
               "requirements":[{"sourceEventId":"E1","sequence":1,"objectives":[{"productId":"milk","quantity":2}]}],
               "terminalRecords":[{"sourceEventId":"E582","sequence":582,"eventCode":"SHOP.SESSION_ENDED","sessionEnd":{"reason":"USER_ABORTED"},"cart":{"milk":1}}],
               "quantityRanges":{"milk":{"afterValueCounts":{"1":2,"2":2,"3":2,"4":1}}}}],
             "sourceEventDetails":[
               {"id":"E563","sessionId":"S1","sequence":563,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"milk","quantityBefore":1,"quantityAfter":2},
               {"id":"E574","sessionId":"S1","sequence":574,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"milk","quantityBefore":3,"quantityAfter":2},
               {"id":"E564","sessionId":"S1","sequence":564,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"water","quantityBefore":1,"quantityAfter":2},
               {"id":"E566","sessionId":"S2","sequence":566,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"milk","quantityBefore":1,"quantityAfter":2},
               {"id":"E567","sessionId":"S1","sequence":567,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"milk","quantityBefore":2,"quantityAfter":3},
               {"id":"E600","sessionId":"S1","sequence":600,"eventCode":"SHOP.QUANTITY_CHANGED","itemId":"milk","quantityBefore":1,"quantityAfter":2}],
             "currentAnalysis":{"practicePlan":{"goal":"milk 99개"}}}
            """);
    }
    ObjectNode candidate(String summary) {
        var root=m.createObjectNode();var a=root.putObject("analysis");a.put("summary",summary);
        a.putArray("evidenceEventIds").add("E563").add("E574").add("E582");
        a.putArray("sessionAssessments").addObject().put("sessionId","S1").put("judgment","FAILURE");
        a.putObject("practicePlan").put("goal","milk 2개 담기").put("itemCount",1)
            .put("rationale","변경: 조건 유지. 안내: 냉장 매대를 열고 우유를 담습니다. 달성: 목표 수량을 담아 배우가 제출합니다. 확인: 수량과 제출 사건.");
        return root;
    }
    GroundedPracticeContract.Rejected rejected(ObjectNode candidate,JsonNode source) {
        var issues=PracticeDesignContract.inspect(candidate.path("analysis"),source);
        assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("PARTIAL_QUANTITY_EVIDENCE_OMITTED");
        return new GroundedPracticeContract.Rejected(candidate.toString(),issues);
    }
    String patch(String path,String value) {var p=m.createObjectNode();p.putObject("patches").put(path,value);return p.toString();}
    JsonNode context(String prompt) {return m.readTree(prompt.substring(prompt.indexOf("{\"permittedTextTargets\"")));}

    @Test void packedOriginalSourcesProvideOnlySameSessionProductAndInRangeTargetEvents() {
        var source=source();var before=source.deepCopy();String packed=new FinalSourceEncoding(m).encodeReadable(source).toString();
        var candidate=candidate("수량은 0에서 1, 2, 3, 4, 3, 2, 1로 바뀌고 제출 없이 실패했습니다.");
        String prompt=GroundedTextPatch.prompt(m,packed,rejected(candidate,source));
        var facts=context(prompt).path("partialQuantityOriginalSources");assertThat(facts).hasSize(1);
        var row=facts.get(0);assertThat(row.path("objective")).isEqualTo(source.at("/sessionSourceLedger/0/requirements/0/objectives/0"));
        assertThat(row.at("/requirementAnchor/sourceEventId").asString()).isEqualTo("E1");
        assertThat(row.at("/terminalRecord/sourceEventId").asString()).isEqualTo("E582");
        assertThat(row.at("/terminalRecord/cart/milk").asInt()).isEqualTo(1);
        assertThat(row.at("/terminalRecord/sessionEnd/reason").asString()).isEqualTo("USER_ABORTED");
        assertThat(row.path("quantityEventsWithRequiredAfterValue").valueStream().map(e->e.path("id").asString()).toList()).containsExactly("E563","E574");
        for(var event:row.path("quantityEventsWithRequiredAfterValue")) {
            var original=source.at(event.path("sourcePath").asString());
            for(String field:List.of("id","sessionId","sequence","eventCode","itemId","quantityBefore","quantityAfter"))assertThat(event.get(field)).isEqualTo(original.get(field));
        }
        assertThat(prompt).startsWith(packed+"\n");assertThat(source).isEqualTo(before);
        assertThat(context(prompt).path("partialQuantityRequiredEdit").asString()).contains("숫자 없는 말","이해·기억·숙달","기존 근거 ID");
        assertThat(row.toString()).doesNotContain("99개");
    }

    @Test void aLaterRequirementExcludesEarlierHitsInsteadOfUsingANextPracticeGoal() {
        var source=source();((ObjectNode)source.at("/sessionSourceLedger/0/requirements/0")).put("sequence",570);
        var facts=context(GroundedTextPatch.prompt(m,source.toString(),rejected(candidate("최종 수량은 1이며 실패했습니다."),source))).path("partialQuantityOriginalSources");
        assertThat(facts.get(0).path("quantityEventsWithRequiredAfterValue").valueStream().map(e->e.path("id").asString()).toList()).containsExactly("E574");
        assertThat(facts.get(0).at("/objective/quantity").asInt()).isEqualTo(2);
    }

    @Test void nestedSourceDoesNotImportAnotherContextWithTheSameLocalSessionAlias() {
        var source=source();var ledger=source.remove("sessionSourceLedger");
        source.putArray("currentTaskComparisonSource").addObject().set("sessionSourceLedger",ledger);
        var facts=context(GroundedTextPatch.prompt(m,source.toString(),rejected(candidate("최종 수량은 1이며 실패했습니다."),source))).path("partialQuantityOriginalSources");
        assertThat(facts).hasSize(1);
        assertThat(facts.get(0).path("requirementSourcePath").asString()).startsWith("/currentTaskComparisonSource/0/");
        assertThat(facts.get(0).path("quantityEventsWithRequiredAfterValue")).isEmpty();
    }

    @Test void originalNumericSequencesAllowANonnumericPartialRelationButNotCopyOrNumericMutation() {
        var source=source();
        for(String summary:List.of("최종 수량은 1이며 제출 없이 실패했습니다.","수량은 4에서 1로 바뀌고 제출 없이 실패했습니다.","수량은 0에서 1, 2, 3, 4, 3, 2, 1로 바뀌고 제출 없이 실패했습니다.")) {
            var original=candidate(summary);var rejected=rejected(original,source);
            String corrected=summary+" 중간에 목표 수량에 도달했으나 최종 수량은 달라졌습니다.";
            var applied=m.readTree(GroundedTextPatch.apply(m,rejected,patch("/summary",corrected)));
            assertThat(PracticeDesignContract.inspect(applied.path("analysis"),source)).isEmpty();
            ((ObjectNode)applied.path("analysis")).put("summary",summary);assertThat(applied).isEqualTo(original);
            String unchanged=GroundedTextPatch.apply(m,rejected,patch("/summary",summary));
            assertThat(PracticeDesignContract.inspect(m.readTree(unchanged).path("analysis"),source)).extracting(GroundedPracticeContract.Violation::code).contains("PARTIAL_QUANTITY_EVIDENCE_OMITTED");
            assertThatThrownBy(()->GroundedTextPatch.apply(m,rejected,patch("/summary",corrected+" 목표는 2개입니다."))).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
            assertThatThrownBy(()->GroundedTextPatch.apply(m,rejected,patch("/sessionAssessments/0/judgment","SUCCESS"))).hasMessage("INVALID_GROUNDED_PATCH");
        }
    }

    @Test void repeatedCopyKeepsTheBoundedRetryAndReceivesTheActualPartialRelationInstructions() {
        var source=source();String sourceText=new FinalSourceEncoding(m).encodeReadable(source).toString();
        String summary="수량은 0에서 1, 2, 3, 4, 3, 2, 1로 바뀌고 제출 없이 실패했습니다.";
        var original=candidate(summary);var rejected=rejected(original,source);var client=mock(GroqChatClient.class);
        var prompts=new ArrayList<String>();
        when(client.complete(eq(GroundedTextPatch.SYSTEM),anyString(),anyInt(),eq(0.0))).thenAnswer(call->{
            prompts.add(call.getArgument(1));
            return new GroqChatClient.GroqChatResult(patch("/summary",prompts.size()==1?summary:summary+" 중간에 목표 수량에 도달했으나 유지되지 않았습니다."),"mock");
        });
        var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator()),client,m).withPlanSemanticReview(false);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        Function<String,String> parser=raw->{var issues=PracticeDesignContract.inspect(m.readTree(raw).path("analysis"),source);if(!issues.isEmpty())throw new GroundedPracticeContract.Rejected(raw,issues);return raw;};
        String result=ReflectionTestUtils.invokeMethod(pipeline,"repairGroundedText",sourceText,rejected,32000,audit,parser);
        assertThat(prompts).hasSize(2);assertThat(audit).hasSize(2);
        assertThat(prompts.get(1)).startsWith(sourceText+"\n").contains("partialQuantityOriginalSources","partialQuantityRequiredEdit","nonnumeric relation","retain final failure");
        assertThat(audit.getFirst().errorCode()).isEqualTo("GROUNDED_PATCH_REJECTED");assertThat(audit.getLast().errorCode()).isNull();
        var actual=m.readTree(result);((ObjectNode)actual.path("analysis")).put("summary",summary);assertThat(actual).isEqualTo(original);
        verify(client,times(2)).complete(eq(GroundedTextPatch.SYSTEM),anyString(),anyInt(),eq(0.0));
    }

    @Test void capturedFailedSessionPreservesSourceAndRevealsItsOriginalGoalHitsAndTerminal() throws Exception {
        var file=Path.of("../output/minjae-five-memory-connected-20261028/auditor/analyses.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(file));
        String bytes=Files.readString(file),hash=QwenTokenCounter.textHash(bytes);int checked=0;
        for(var stored:m.readTree(bytes))if(stored.path("error_code").asString("").equals("CHUNK_ANALYSIS_FAILED")) {
            JsonNode live=null;for(var attempt:stored.path("attempts"))if(attempt.path("source").asString().equals("LIVE"))live=attempt;
            if(live==null)continue;
            String sourceText=live.path("inputPrompt").asString();var decoded=new FinalSourceEncoding(m).decode(m.readTree(sourceText));
            var original=m.readTree(live.path("rawOutput").asString());
            var issues=PracticeDesignContract.inspect(original.path("analysis"),decoded).stream().filter(v->v.code().equals("PARTIAL_QUANTITY_EVIDENCE_OMITTED")).toList();
            assertThat(issues).hasSize(1);var rejected=new GroundedPracticeContract.Rejected(original.toString(),issues);
            String prompt=GroundedTextPatch.prompt(m,sourceText,rejected);
            var facts=context(prompt).path("partialQuantityOriginalSources");assertThat(facts).hasSize(1);
            assertThat(facts.get(0).at("/objective/quantity").asInt()).isEqualTo(2);
            assertThat(facts.get(0).path("quantityEventsWithRequiredAfterValue").valueStream().map(e->e.path("id").asString()).toList()).containsExactly("E563","E574");
            assertThat(facts.get(0).at("/terminalRecord/sourceEventId").asString()).isEqualTo("E582");
            assertThat(facts.get(0).at("/terminalRecord/cart/milk").asInt()).isEqualTo(1);
            // A mock AI response, never a server-authored production summary.
            var issue=issues.getFirst();String corrected=issue.quote()+" 중간에 목표 수량에 도달했으나 최종 수량은 달라졌습니다.";
            var applied=m.readTree(GroundedTextPatch.apply(m,rejected,patch(issue.path(),corrected)));
            assertThat(PracticeDesignContract.inspect(applied.path("analysis"),decoded)).extracting(GroundedPracticeContract.Violation::code).doesNotContain("PARTIAL_QUANTITY_EVIDENCE_OMITTED");
            assertThat(prompt).startsWith(sourceText+"\n");
            assertThat(QwenTokenCounter.count(GroundedTextPatch.SYSTEM)+QwenTokenCounter.count(prompt)+GroundedTextPatch.outputTokens(m,rejected)+256).isLessThan(32000);
            checked++;
        }
        assertThat(checked).isEqualTo(3);assertThat(QwenTokenCounter.textHash(Files.readString(file))).isEqualTo(hash);
    }
}
