package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;

class AnalysisReviewConsistencyTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private AnalysisReferences refs(String name) {
        return new AnalysisReferences(fixture.mapper, fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture(name), BehaviorAnalysisInputResponse.class));
    }
    ObjectNode envelope(String name) {
        var source = new ReviewedClaimOutputTest().envelope();
        source.put("reviewFormat", AnalysisReviewConsistency.FORMAT);
        var finding = (ObjectNode)source.path("analysis").path("findings").get(0);
        var observations = finding.putArray("observation");
        observations.addObject().put("text", "상호작용 시작이 기록됐습니다.").putArray("evidenceEventIds").add("E4");
        observations.addObject().put("text", "최종 장바구니 기록이 있습니다.").putArray("evidenceEventIds").add("E11");
        ((ObjectNode)source.path("analysis")).putArray("uncertainties").add("선택 이유는 확인되지 않았습니다.");
        var assessment = (ObjectNode)source.path("analysis").path("sessionAssessments").get(0);
        assessment.put("judgment", name.equals("corrected-selection") ? "SUCCESS" : "FAILURE");
        var check = source.putArray("taskChecks").addObject().put("sessionId", "S1");
        var objectives = check.putArray("objectives");
        for (String product : List.of("milk", "banana")) {
            var value = objectives.addObject().put("productId", product).put("status",
                    name.equals("help-movement-timeout") || (name.equals("wrong-specification") && product.equals("milk")) ? "UNMET" : "MET");
            value.putArray("evidenceEventIds").add("E1").add("E11");
        }
        check.putObject("budget").put("status", "MET").putArray("evidenceEventIds").add("E1").add("E11");
        check.putObject("submission").put("status", name.equals("help-movement-timeout") ? "UNMET" : "MET")
                .putArray("evidenceEventIds").add("E11");
        var rationale = ((ObjectNode)source.path("analysis").path("practicePlan")).putObject("rationale");
        rationale.putArray("observed").addObject().put("findingId", "F1").put("observationIndex", 1);
        rationale.putArray("unknownCauseIndexes").add(0);
        rationale.put("proposedPractice", "다음에는 표기를 대조하는 절차를 연습합니다.").putNull("baselineDifficulty");
        rationale.putArray("supportCapabilities").add("TEXT_GUIDANCE");
        var stations = source.putArray("stationClaims");
        if (!name.equals("help-movement-timeout")) stations.addObject().put("eventId", "E4").put("stationId", "fresh").put("kind", "UNKNOWN");
        return source;
    }
    private ObjectNode check(ObjectNode source) { return (ObjectNode)source.path("taskChecks").get(0); }
    private String read(ObjectNode source, String name) { return AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, source.toString(), refs(name)); }

    @Test void all_three_source_grounded_ai_condition_sets_preserve_public_output_and_original_audit() {
        for (String name : List.of("corrected-selection", "wrong-specification", "help-movement-timeout")) {
            var source = envelope(name); String before = source.toString();
            var result = fixture.mapper.readTree(read(source, name));
            assertThat(result.path("practicePlan").path("rationale").asString())
                    .isEqualTo("관찰: 최종 장바구니 기록이 있습니다. 미확인: 선택 이유는 확인되지 않았습니다. 다음 연습: 다음에는 표기를 대조하는 절차를 연습합니다.");
            assertThat(source.toString()).isEqualTo(before);
            assertThat(result.has("taskChecks")).isFalse();
        }
    }
    @ParameterizedTest @ValueSource(strings={"COMPLETED", "FLOW_FINISHED", "EXIT_AFTER_SUBMISSION"})
    void lifecycle_labels_never_allow_ai_unmet_condition_and_success_to_pass(String reason) {
        var raw = new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification");
        ((ObjectNode)raw.path("input").path("sessions").get(0).path("events").get(11).path("sessionEnd")).put("reason", reason);
        var source = envelope("wrong-specification");
        ((ObjectNode)source.path("analysis").path("sessionAssessments").get(0)).put("judgment", "SUCCESS");
        var refs = new AnalysisReferences(fixture.mapper, fixture.mapper.treeToValue(raw, BehaviorAnalysisInputResponse.class));
        assertThatThrownBy(() -> AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, source.toString(), refs))
                .hasMessage("REVIEW_TASK_JUDGMENT_CONTRADICTION");
    }
    @Test void unknown_success_all_met_failure_missing_goal_and_cross_source_ids_are_rejected() {
        var unknown = envelope("corrected-selection");
        ((ObjectNode)check(unknown).path("objectives").get(0)).put("status", "UNKNOWN");
        assertThatThrownBy(() -> read(unknown, "corrected-selection")).hasMessage("REVIEW_TASK_JUDGMENT_CONTRADICTION");
        var failure = envelope("corrected-selection");
        ((ObjectNode)failure.path("analysis").path("sessionAssessments").get(0)).put("judgment", "FAILURE");
        assertThatThrownBy(() -> read(failure, "corrected-selection")).hasMessage("REVIEW_TASK_JUDGMENT_CONTRADICTION");
        var missing = envelope("corrected-selection"); ((ArrayNode)check(missing).path("objectives")).remove(1);
        assertThatThrownBy(() -> read(missing, "corrected-selection")).hasMessage("REVIEW_TASK_CHECK_COVERAGE");
        var invented = envelope("corrected-selection");
        ((ObjectNode)check(invented).path("objectives").get(0)).putArray("evidenceEventIds").add("E999");
        assertThatThrownBy(() -> read(invented, "corrected-selection")).hasMessage("REVIEW_TASK_CHECK_INVALID");
    }
    @Test void unavailable_support_or_unrecorded_difficulty_cannot_be_delivered_in_plan_basis() {
        var source = envelope("corrected-selection");
        var rationale = (ObjectNode)source.path("analysis").path("practicePlan").path("rationale");
        rationale.putArray("supportCapabilities").add("VISUAL_HIGHLIGHT");
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_UNSUPPORTED_CAPABILITY");
        rationale.putArray("supportCapabilities").add("TEXT_GUIDANCE"); rationale.put("baselineDifficulty", 2);
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_UNRECORDED_DIFFICULTY_BASELINE");
    }
    @Test void plan_cannot_reinvent_an_observed_fact_or_an_uncertain_cause() {
        var source = envelope("corrected-selection");
        var basis = (ObjectNode)source.path("analysis").path("practicePlan").path("rationale");
        basis.putArray("observed").addObject().put("text", "허용 상품 ID는 맞았습니다.").putArray("evidenceEventIds").add("E11");
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");
        basis.putArray("observed").addObject().put("findingId", "F1").put("observationIndex", 99);
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_PLAN_OBSERVATION_REFERENCE");
        basis.putArray("observed").addObject().put("findingId", "F1").put("observationIndex", 1);
        basis.putArray("unknownCauseIndexes").add(99);
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_PLAN_UNCERTAINTY_REFERENCE");
    }
    @Test void unknown_station_cannot_be_claimed_as_shelf_and_a_cited_station_cannot_be_omitted() {
        var source = envelope("corrected-selection");
        ((ObjectNode)source.path("stationClaims").get(0)).put("kind", "shelf");
        assertThatThrownBy(() -> read(source, "corrected-selection")).hasMessage("REVIEW_STATION_CLAIM_INVALID");
        source.putArray("stationClaims");
        assertThatThrownBy(() -> read(source, "corrected-selection"))
                .isInstanceOfSatisfying(ReviewEvidenceException.class, failure -> {
                    assertThat(failure.details().code()).isEqualTo("REVIEW_STATION_CLAIM_COVERAGE");
                    assertThat(failure.details().offendingIds()).containsExactly("E4");
                });
    }
    @Test void readable_station_rows_copy_the_same_validator_sources_without_inferring_unknown_types() {
        var references = refs("corrected-selection");
        String original = references.reviewSource().toString();
        var prompt = fixture.mapper.readTree(AnalysisReviewPrompt.build(fixture.mapper, "{}", null, references));
        var rows = prompt.path("stationClaimSources");
        assertThat(rows.size()).isEqualTo(references.recordedStations().size());
        for (var row : rows) {
            var station = references.recordedStations().get(row.path("eventId").asString());
            assertThat(row.path("stationId")).isEqualTo(station.path("stationId"));
            assertThat(row.path("kind")).isEqualTo(station.path("kind"));
        }
        assertThat(rows).anySatisfy(row -> {
            assertThat(row.path("eventId").asString()).isEqualTo("E4");
            assertThat(row.path("kind").asString()).isEqualTo("UNKNOWN");
        });
        var review = envelope("corrected-selection");
        review.set("stationClaims", rows.deepCopy());
        assertThatCode(() -> AnalysisReviewConsistency.validate(review, references)).doesNotThrowAnyException();
        assertThat(references.reviewSource().toString()).isEqualTo(original);
    }
    @Test void old_saved_format_remains_readable_but_cannot_bypass_current_live_checks() {
        var source = new ReviewedClaimOutputTest().envelope();
        var legacyRefs = new AnalysisReferences(fixture.mapper, fixture.input(fixture.fixture()));
        assertThat(AnalysisReviewPrompt.reviewedAnalysis(fixture.mapper, source.toString(), legacyRefs)).isNotBlank();
        assertThatThrownBy(() -> AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper, source.toString(), legacyRefs))
                .hasMessage("CURRENT_REVIEW_FORMAT_REQUIRED");
    }
    @Test void station_types_use_only_recorded_prior_geometry_and_never_future_snapshots_or_id_names() {
        var raw = new SyntheticAnalysisSmokeLiveTest().fixture("help-movement-timeout");
        var events = raw.path("input").path("sessions").get(0).path("events");
        var scene = (ObjectNode)events.get(0).path("payload").path("marketContent").path("sceneSnapshot");
        scene.putObject("startingConditions").putObject("geometry").putArray("stationDetails")
                .addObject().put("id", "common-door").put("kind", "common-door");
        var input = fixture.mapper.treeToValue(raw, BehaviorAnalysisInputResponse.class);
        var identities = new AnalysisReferences(fixture.mapper, input).recordedStations();
        assertThat(identities.get("E5").path("kind").asString()).isEqualTo("common-door");
        scene.remove("startingConditions");
        ((ObjectNode)events.get(11).path("payload").path("marketContent")).putObject("sceneSnapshot").putObject("startingConditions")
                .putObject("geometry").putArray("stationDetails").addObject().put("id", "common-door").put("kind", "shelf");
        assertThat(new AnalysisReferences(fixture.mapper, fixture.mapper.treeToValue(raw, BehaviorAnalysisInputResponse.class))
                .recordedStations().get("E5").path("kind").asString()).isEqualTo("UNKNOWN");
    }
}
