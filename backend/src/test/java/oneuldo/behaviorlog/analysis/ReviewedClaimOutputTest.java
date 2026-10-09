package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;

class ReviewedClaimOutputTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private final oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse input=fixture.input(fixture.fixture());
    private final AnalysisReferences refs=new AnalysisReferences(fixture.mapper,input);

    ObjectNode envelope() {
        return (ObjectNode)fixture.mapper.readTree("""
            {"reviewFormat":"claim-evidence-v2","reviewNotes":[],"analysis":{
              "summary":[{"text":"제공된 미션의 조작 기록입니다.","evidenceEventIds":["E1"]}],
              "findings":[{"id":"F1","skill":"수량 조정",
                "observation":[{"text":"장바구니를 열었습니다.","evidenceEventIds":["E2"]},
                               {"text":"수량을 변경했습니다.","evidenceEventIds":["E4"]}],
                "interpretation":[{"text":"동기는 미확인입니다.","evidenceEventIds":[]}],
                "alternativeExplanations":[],"suggestedSupport":"목록과 수량을 비교하는 연습"}],
              "sessionAssessments":[{"sessionId":"S1","judgment":"UNDETERMINED",
                "explanation":[{"text":"조작만으로 완료를 판단할 수 없습니다.","evidenceEventIds":["E4"]}]}],
              "uncertainties":["동기는 미확인"],
              "practicePlan":{"targetFindingIds":["F1"],"goal":"목록 확인","rationale":"기록된 조작을 연습",
                "recommendedDifficulty":1,"itemCount":2,"quantityComplexity":"LOW","budgetPressure":"LOW",
                "textSupport":"SIMPLIFIED","reasonCodes":["OBSERVATION_PRACTICE"]},"usedEvidenceCardIds":[]}}
            """);
    }
    private ObjectNode finding(ObjectNode envelope) { return (ObjectNode)envelope.path("analysis").path("findings").get(0); }
    private ObjectNode observation(ObjectNode envelope,int i) { return (ObjectNode)finding(envelope).path("observation").get(i); }
    private String read(ObjectNode envelope) { return AnalysisReviewPrompt.reviewedAnalysis(fixture.mapper,envelope.toString(),refs); }

    @Test void renders_one_evidence_source_into_existing_public_contract_without_rewriting_claims() {
        var source=envelope();String before=source.toString();
        var normalized=fixture.mapper.readTree(read(source));
        var f=normalized.path("findings").get(0);
        assertThat(f.path("observation").asString()).isEqualTo("(E2) 장바구니를 열었습니다. (E4) 수량을 변경했습니다.");
        assertThat(f.path("evidenceEventIds").toString()).isEqualTo("[\"E2\",\"E4\"]");
        assertThat(f.path("interpretation").asString()).isEqualTo("동기는 미확인입니다.");
        assertThat(f.path("alternativeExplanations").isEmpty()).isTrue();
        assertThat(normalized.path("summary").asString()).isEqualTo(source.path("analysis").path("summary").get(0).path("text").asString());
        var result=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(normalized.toString()),input);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("UNDETERMINED");
        assertThat(source.toString()).isEqualTo(before);
    }
    @Test void redundant_inline_annotations_are_equivalent_to_the_same_claim_without_annotations() {
        var source=envelope();
        observation(source,0).put("text","장바구니를 열었습니다(E2).");
        observation(source,1).put("text","수량을 변경했습니다[E4].");
        String before=source.toString();
        assertThat(read(source)).isEqualTo(read(envelope()));
        assertThat(source.toString()).isEqualTo(before);
    }
    @Test void inline_evidence_from_another_claim_or_an_empty_annotation_only_claim_still_fails() {
        for(String text:List.of("장바구니를 열었습니다(E4).","장바구니를 열었습니다(E999).")) {
            var source=envelope();observation(source,0).put("text",text);
            assertThatThrownBy(()->read(source)).hasMessage("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
        }
        var empty=envelope();observation(empty,0).put("text","(E2)");
        assertThatThrownBy(()->read(empty)).hasMessage("INVALID_REVIEW_CLAIM_TEXT");
    }
    @Test void changing_a_claims_evidence_cannot_leave_a_stale_parent_list_or_check_table() {
        var source=envelope();
        observation(source,1).putArray("evidenceEventIds").add("E5");
        ((ObjectNode)finding(source).path("interpretation").get(0)).putArray("evidenceEventIds").add("E1");
        var normalized=fixture.mapper.readTree(read(source)).path("findings").get(0);
        assertThat(normalized.path("evidenceEventIds").toString()).isEqualTo("[\"E1\",\"E2\",\"E5\"]");
        assertThat(normalized.path("observation").asString()).contains("(E5)").doesNotContain("E4");
        assertThat(normalized.path("interpretation").asString()).isEqualTo("동기는 미확인입니다.");
    }
    @Test void multiple_summary_interpretation_and_assessment_sentences_are_preserved_in_order() {
        var source=envelope();
        ((ArrayNode)source.path("analysis").path("summary")).addObject().put("text","두 번째 요약입니다.").putArray("evidenceEventIds").add("E4");
        ((ArrayNode)finding(source).path("interpretation")).addObject().put("text","다른 문장의 해석입니다.").putArray("evidenceEventIds").add("E3");
        ((ArrayNode)source.path("analysis").path("sessionAssessments").get(0).path("explanation"))
                .addObject().put("text","확인 범위가 제한됩니다.").putArray("evidenceEventIds").add("E2");
        var result=fixture.mapper.readTree(read(source));
        assertThat(result.path("summary").asString()).isEqualTo("제공된 미션의 조작 기록입니다. 두 번째 요약입니다.");
        assertThat(result.path("findings").get(0).path("interpretation").asString()).isEqualTo("동기는 미확인입니다. 다른 문장의 해석입니다.");
        assertThat(result.path("findings").get(0).path("evidenceEventIds").toString()).isEqualTo("[\"E2\",\"E3\",\"E4\"]");
        var assessment=result.path("sessionAssessments").get(0);
        assertThat(assessment.path("explanation").asString()).isEqualTo("조작만으로 완료를 판단할 수 없습니다. 확인 범위가 제한됩니다.");
        assertThat(assessment.path("evidenceEventIds").toString()).isEqualTo("[\"E2\",\"E4\"]");
    }
    @Test void single_object_instead_of_claim_array_is_rejected_without_discarding_text() {
        var source=envelope();
        ((ObjectNode)source.path("analysis")).set("summary",source.path("analysis").path("summary").get(0).deepCopy());
        assertThatThrownBy(()->read(source)).hasMessage("INVALID_REVIEW_CLAIM_ARRAY");
    }
    @Test void rejects_unknown_empty_duplicate_and_non_event_claim_evidence() {
        for(var ids:List.of(List.of("E999"),List.<String>of(),List.of("E4","E4"),List.of("S1"))) {
            var source=envelope();observation(source,0).set("evidenceEventIds",fixture.mapper.valueToTree(ids));
            assertThatThrownBy(()->read(source)).isInstanceOf(ReviewEvidenceException.class);
        }
    }
    @Test void shared_boundary_evidence_preserves_claims_and_deduplicates_the_public_evidence_list() {
        for(var ids:List.of(List.of("E4"),List.of("E4","E5"))) {
            var source=envelope();
            observation(source,0).putArray("evidenceEventIds").add("E2").add("E4");
            observation(source,1).set("evidenceEventIds",fixture.mapper.valueToTree(ids));
            String before=source.toString();
            var normalized=fixture.mapper.readTree(read(source));
            var f=normalized.path("findings").get(0);
            assertThat(f.path("observation").asString()).isEqualTo(
                    "(E2, E4) 장바구니를 열었습니다. ("+String.join(", ",ids)+") 수량을 변경했습니다.");
            var expected=new ArrayList<>(List.of("E2","E4"));
            if(ids.contains("E5")) expected.add("E5");
            assertThat(f.path("evidenceEventIds")).isEqualTo(fixture.mapper.valueToTree(expected));
            new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(normalized.toString()),input);
            assertThat(source.toString()).isEqualTo(before);
        }
    }
    @Test void consecutive_claims_can_describe_the_same_single_event() {
        var source=envelope();
        observation(source,1).putArray("evidenceEventIds").add("E2");
        var normalized=fixture.mapper.readTree(read(source)).path("findings").get(0);
        assertThat(normalized.path("observation").asString())
                .isEqualTo("(E2) 장바구니를 열었습니다. (E2) 수량을 변경했습니다.");
        assertThat(normalized.path("evidenceEventIds").toString()).isEqualTo("[\"E2\"]");
    }
    @Test void duplicate_evidence_within_one_claim_has_a_specific_error() {
        var source=envelope();observation(source,0).putArray("evidenceEventIds").add("E2").add("E2");
        assertThatThrownBy(()->read(source)).isInstanceOfSatisfying(ReviewEvidenceException.class,error->{
            assertThat(error.details().code()).isEqualTo("DUPLICATE_REVIEW_EVIDENCE");
            assertThat(error.details().path()).isEqualTo("/findings/0/observation/0");
            assertThat(error.details().offendingIds()).containsExactly("E2","E2");
        });
    }
    @Test void citation_set_order_is_normalized_without_changing_the_claim_or_chosen_evidence() {
        var source=envelope();var clause=observation(source,0);
        clause.putArray("evidenceEventIds").add("E4").add("E2");
        observation(source,1).putArray("evidenceEventIds").add("E4");
        var normalized=fixture.mapper.readTree(read(source)).path("findings").get(0);
        assertThat(normalized.path("observation").asString()).startsWith("(E2, E4) 장바구니를 열었습니다.");
        assertThat(normalized.path("evidenceEventIds").toString()).isEqualTo("[\"E2\",\"E4\"]");
    }
    @Test void rejects_returning_to_earlier_events_even_when_the_event_was_already_cited() {
        for(var ids:List.of(List.of("E1"),List.of("E2"),List.of("E3"),List.of("E2","E4"))) {
            var source=envelope();
            observation(source,0).putArray("evidenceEventIds").add("E2").add("E4");
            observation(source,1).set("evidenceEventIds",fixture.mapper.valueToTree(ids));
            assertThatThrownBy(()->read(source)).hasMessage("REVIEW_EVIDENCE_OUT_OF_ORDER");
        }
    }
    @Test void rejects_duplicate_contract_sources_instead_of_silently_choosing_one() {
        var checks=envelope();checks.putArray("claimChecks");
        assertThatThrownBy(()->read(checks)).hasMessage("INVALID_REVIEW_CLAIM_SHAPE");
        var parent=envelope();finding(parent).putArray("evidenceEventIds").add("E999");
        assertThatThrownBy(()->read(parent)).hasMessage("INVALID_REVIEW_CLAIM_SHAPE");
        var inline=envelope();observation(inline,0).put("text","(E999) 장바구니를 열었습니다.");
        assertThatThrownBy(()->read(inline)).hasMessage("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
    }
    @Test void rejects_missing_claims_legacy_envelopes_and_wrong_format() {
        var missing=envelope();finding(missing).remove("interpretation");
        assertThatThrownBy(()->read(missing)).hasMessage("INVALID_REVIEW_CLAIM_SHAPE");
        var legacy=envelope();legacy.remove("reviewFormat");legacy.putArray("claimChecks");
        assertThatThrownBy(()->read(legacy)).hasMessage("INVALID_REVIEW_CLAIM_SHAPE");
        var version=envelope();version.put("reviewFormat","unknown");
        assertThatThrownBy(()->read(version)).hasMessage("INVALID_REVIEW_FORMAT");
    }
    @Test void alternative_claims_need_evidence_and_do_not_change_other_claims() {
        var source=envelope();
        finding(source).putArray("alternativeExplanations").addObject().put("text","기록된 도움을 사용했습니다.").putArray("evidenceEventIds").add("E3");
        var normalized=fixture.mapper.readTree(read(source)).path("findings").get(0);
        assertThat(normalized.path("alternativeExplanations").toString()).isEqualTo("[\"기록된 도움을 사용했습니다.\"]");
        assertThat(normalized.path("evidenceEventIds").toString()).isEqualTo("[\"E2\",\"E3\",\"E4\"]");
        ((ObjectNode)finding(source).path("alternativeExplanations").get(0)).putArray("evidenceEventIds");
        assertThatThrownBy(()->read(source)).hasMessage("INVALID_REVIEW_CLAIM_ARRAY");
    }
}
