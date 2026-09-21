package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import static org.assertj.core.api.Assertions.*;

class ReviewEvidenceChecksTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private final AnalysisReferences refs = new AnalysisReferences(fixture.mapper, fixture.input(fixture.fixture()));
    private final JsonNode analysis = fixture.mapper.readTree("""
        {"summary":"사건 관찰","findings":[{"observation":"(E2) 열기. (E4) 수량 변경.","interpretation":"동기 미확인",
        "alternativeExplanations":[],"evidenceEventIds":["E2","E4"]}],
        "sessionAssessments":[{"explanation":"미확인","evidenceEventIds":["E4"]}]}
        """);
    private JsonNode checks(String evidence) {
        return fixture.mapper.readTree("""
            [["/summary",["E2","E4"]],["/findings/0/observation",%s],
             ["/findings/0/interpretation",[]],["/sessionAssessments/0/explanation",["E4"]]]
            """.formatted(evidence));
    }
    @Test void permits_no_alternative_and_unknown_motivation_without_invented_evidence() {
        assertThatCode(() -> ReviewEvidenceChecks.validate(analysis, checks("[\"E2\",\"E4\"]"), refs)).doesNotThrowAnyException();
    }
    @Test void summary_can_cite_source_context_absent_from_findings_without_mutating_evidence() {
        var checks=(tools.jackson.databind.node.ArrayNode)checks("[\"E2\",\"E4\"]");
        checks.set(0,fixture.mapper.readTree("[\"/summary\",[\"E1\",\"E2\"]]"));
        String before=analysis.toString();
        assertThatCode(()->ReviewEvidenceChecks.validate(analysis,checks,refs)).doesNotThrowAnyException();
        assertThat(analysis.toString()).isEqualTo(before);
    }
    @Test void summary_still_rejects_unknown_non_event_duplicate_and_reversed_ids() {
        for(String evidence:java.util.List.of("[\"E999\"]","[\"S1\"]","[\"E1\",\"E1\"]","[\"E4\",\"E1\"]")) {
            var checks=(tools.jackson.databind.node.ArrayNode)checks("[\"E2\",\"E4\"]");
            checks.set(0,fixture.mapper.readTree("[\"/summary\","+evidence+"]"));
            assertThatThrownBy(()->ReviewEvidenceChecks.validate(analysis,checks,refs))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void source_context_is_not_automatically_valid_for_a_different_finding() {
        assertThatThrownBy(()->ReviewEvidenceChecks.validate(analysis,checks("[\"E1\",\"E2\",\"E4\"]"),refs))
                .isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
                    assertThat(e.details().code()).isEqualTo("REVIEW_EVIDENCE_NOT_CITED");
                    assertThat(e.details().path()).isEqualTo("/findings/0/observation");
                    assertThat(e.details().offendingIds()).containsExactly("E1");
                });
    }
    @Test void reviewing_only_one_of_two_inline_events_is_not_complete_coverage() {
        assertThatThrownBy(()->ReviewEvidenceChecks.validate(analysis,checks("[\"E2\"]"),refs))
                .isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
                    assertThat(e.details().code()).isEqualTo("REVIEW_OBSERVATION_NOT_COVERED");
                    assertThat(e.details().path()).isEqualTo("/findings/0/observation");
                    assertThat(e.details().offendingIds()).containsExactly("E4");
                });
    }
    @Test void accepts_unambiguous_envelope_pointers_and_removed_alternative_notes() {
        var checks=(tools.jackson.databind.node.ArrayNode)checks("[\"E2\",\"E4\"]");
        ((tools.jackson.databind.node.ArrayNode)checks.get(0)).set(0,fixture.mapper.valueToTree("/analysis/summary"));
        checks.add(fixture.mapper.readTree("[\"/analysis/findings/0/alternativeExplanations/0\",[]]"));
        checks.add(fixture.mapper.readTree("[\"/findings/0/alternativeExplanations\",[]]"));
        assertThatCode(()->ReviewEvidenceChecks.validate(analysis,checks,refs)).doesNotThrowAnyException();
    }
    @Test void rejects_reversed_or_fabricated_inline_citations_even_if_check_list_is_sorted() {
        for (String text:java.util.List.of("(E4) 수량 변경 후 (E2) 열기", "(E2) 열기 (E3) 조작", "사건 ID 생략")) {
            var changed=analysis.deepCopy();
            ((tools.jackson.databind.node.ObjectNode)changed.path("findings").get(0)).put("observation",text);
            assertThatThrownBy(()->ReviewEvidenceChecks.validate(changed,checks("[\"E2\",\"E4\"]"),refs))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void rejects_reversed_duplicate_unknown_and_uncited_references() {
        for (var pair : new String[][]{
                {"[\"E4\",\"E2\"]","REVIEW_EVIDENCE_OUT_OF_ORDER"},
                {"[\"E2\",\"E2\"]","REVIEW_EVIDENCE_OUT_OF_ORDER"},
                {"[\"E999\"]","UNKNOWN_REVIEW_EVIDENCE"},
                {"[\"E3\"]","REVIEW_EVIDENCE_NOT_CITED"},
                {"[]","MISSING_REVIEW_EVIDENCE"}}) {
            assertThatThrownBy(() -> ReviewEvidenceChecks.validate(analysis, checks(pair[0]), refs)).hasMessageStartingWith(pair[1]);
        }
    }
    @Test void rejects_missing_duplicate_and_unreviewed_alternative_claims() {
        var checks=(tools.jackson.databind.node.ArrayNode)checks("[\"E2\",\"E4\"]");
        checks.remove(0);
        assertThatThrownBy(() -> ReviewEvidenceChecks.validate(analysis, checks, refs)).hasMessage("MISSING_REVIEW_CLAIM_CHECK");
        checks.add(checks.get(0).deepCopy());
        assertThatThrownBy(() -> ReviewEvidenceChecks.validate(analysis, checks, refs)).hasMessage("INVALID_REVIEW_PATH");
        var withAlternative=analysis.deepCopy();
        ((tools.jackson.databind.node.ObjectNode)withAlternative.path("findings").get(0)).putArray("alternativeExplanations").add("다른 설명");
        assertThatThrownBy(() -> ReviewEvidenceChecks.validate(withAlternative, checks("[\"E2\",\"E4\"]"), refs))
                .hasMessage("MISSING_REVIEW_CLAIM_CHECK");
    }
}
