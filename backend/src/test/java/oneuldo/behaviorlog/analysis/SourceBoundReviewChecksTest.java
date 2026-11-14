package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class SourceBoundReviewChecksTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final String PATH = "/findings/0/observation/0/text";
    private static final String VALID = "{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}";

    @Test void an_actual_model_valid_is_preserved_but_cited_exit_cannot_prove_named_shelf_proximity() {
        String candidate = candidate("fresh 및 produce 매대 근처를 지났으나, 상품은 선택하지 않았습니다.", "목록 확인").toString();
        String source = source("exit", false).toString();
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, candidate, source))
                .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class, rejection -> {
                    assertThat(rejection.review()).isEqualTo(VALID);
                    assertThat(rejection.sourceBoundIssue().code()).isEqualTo("STATION_PROXIMITY_MISMATCH");
                    assertThat(rejection.sourceBoundIssue().path()).isEqualTo(PATH);
                    assertThat(rejection.sourceBoundIssue().quote()).isEqualTo("fresh 및 produce 매대 근처를 지났으나");
                    assertThat(mapper.valueToTree(rejection.sourceBoundIssue().sourceProof()).toString())
                            .contains("/sourceEventDetails/0", "exit", "100");
                    assertThat(ReviewSemanticTextPatch.canRepair(mapper, candidate, rejection)).isTrue();
                    assertThat(ReviewSemanticTextPatch.prompt(mapper, source, candidate, rejection))
                            .startsWith(source + "\nCandidate (all values retained): " + candidate)
                            .contains(VALID, "technical diagnostic, not a model response");
                });
    }

    @Test void negative_uncertain_future_and_separate_opening_nonselection_clauses_are_not_rewritten() {
        for (String text : List.of("fresh 매대에 접근하지 않았습니다.", "fresh 매대에 접근했는지는 확인할 수 없습니다.",
                "fresh 진열대를 열었지만, banana 상품은 선택하지 않았습니다.", "fresh 매대에 접근했는지 다음에 관찰합니다.")) {
            String candidate = candidate(text, "상품을 찾을 수 있는지 다음에 관찰합니다.").toString();
            assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, candidate, source("exit", false).toString()))
                    .doesNotThrowAnyException();
        }
    }

    @Test void recorded_station_proof_is_literal_and_bound_to_this_claims_existing_citation() {
        var candidate = candidate("fresh 매대 근처에 접근했습니다.", "목록 확인"); var source = source("fresh", false);
        String valid = validChecks(candidate.toString(), source.toString(), false);
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, valid, candidate.toString(), source.toString())).doesNotThrowAnyException();
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, candidate.toString(), source.toString()))
                .hasMessage("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
        for (String bad : List.of(valid.replace("/sourceEventDetails/0/recordedStation", "/sourceEventDetails/99/recordedStation"),
                valid.replace("\"eventId\":\"E1\"", "\"eventId\":\"E999\""), valid.replace("\"kind\":\"shelf\"", "\"kind\":\"exit\"")))
            assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, bad, candidate.toString(), source.toString()))
                    .hasMessage("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
    }

    @Test void cited_coordinates_with_same_scene_station_and_recorded_radius_are_valid_but_changed_values_are_not() {
        var candidate = candidate("fresh 매대 근처에 접근했습니다.", "목록 확인"); var source = source(null, true);
        String valid = validChecks(candidate.toString(), source.toString(), true);
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, valid, candidate.toString(), source.toString())).doesNotThrowAnyException();
        for (String bad : List.of(valid.replace("\"x\":495", "\"x\":490"),
                valid.replace("\"radiusValue\":105", "\"radiusValue\":999"),
                valid.replace("/sourceMovementContext/sessions/0/sceneSources/0/recordedGeometry/stations/fresh", "/sourceMovementContext/sessions/9/sceneSources/0/recordedGeometry/stations/fresh")))
            assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, bad, candidate.toString(), source.toString()))
                    .hasMessage("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
    }

    @Test void an_or_claim_can_use_one_named_station_and_an_and_claim_needs_both() {
        String source = source("fresh", false).toString();
        String any = candidate("fresh 또는 produce 매대 근처에 접근했습니다.", "목록 확인").toString();
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, validChecks(any, source, false), any, source)).doesNotThrowAnyException();
        String both = candidate("fresh 및 produce 매대 근처에 접근했습니다.", "목록 확인").toString();
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, both, source))
                .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class, rejected -> assertThat(rejected.sourceBoundIssue().code()).isEqualTo("STATION_PROXIMITY_MISMATCH"));
    }

    @Test void current_staff_layout_stockout_receipt_quantity_time_schema_settings_are_supported_as_future_changes() {
        String plan = "직원 수를 2명으로 배치합니다. 매장 구조를 corner로 변경합니다. 품절과 대체 선택을 설정합니다. 영수증 오류 연습을 제공합니다. "
                + "stockOverrides와 matchRule을 변경합니다. 제한 시간을 조절합니다. 상품군 순서를 변경합니다.";
        String candidate = candidate("상품 선택 여부는 미확인입니다.", plan).toString(); String source = source(null, false).toString();
        String valid = validChecks(candidate, source, false);
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, valid, candidate, source)).doesNotThrowAnyException();
        var fields = SourceBoundReviewChecks.capabilities(mapper).path("fields");
        for (String field : List.of("/runtimePlan/environment/layoutId", "/runtimePlan/environment/employeeCount",
                "/runtimePlan/environment/customerCount", "/runtimePlan/environment/pillarCount", "/runtimePlan/environment/chairCount",
                "/runtimePlan/environment/cashierCount", "/runtimePlan/environment/kioskLane", "/runtimePlan/environment/entranceConstruction",
                "/runtimePlan/learning/stockoutProductId", "/runtimePlan/learning/allowSubstitution", "/runtimePlan/learning/budgetChoiceEnabled",
                "/runtimePlan/learning/choiceBudget", "/runtimePlan/learning/checkoutReviewMode", "/runtimePlan/stockOverrides", "/timeLimitSeconds", "/environmentPlan/shelfOrder"))
            assertThat(fields.path(field).path("implemented").asBoolean()).as(field).isTrue();
        assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, valid.replace("\"implemented\":true", "\"implemented\":false"), candidate, source))
                .hasMessage("REVIEW_SOURCE_BOUND_CHECK_REQUIRED");
    }

    @Test void visual_highlight_and_forced_bounds_do_not_become_supported_by_nearby_text_or_layout_settings() {
        String source = source(null, false).toString();
        for (String plan : List.of("문자 지원을 제공합니다. 목표 매대 위치를 시각적으로 강조하거나 탐색 범위를 제한합니다.",
                "매장 구조를 변경하고, 시각적 강조 표시를 제공합니다.")) {
            String candidate = candidate("상품 선택 여부는 미확인입니다.", plan).toString();
            assertThatThrownBy(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, candidate, source))
                    .isInstanceOfSatisfying(AnalysisPlanSemanticReview.Rejected.class, rejected -> {
                        assertThat(rejected.review()).isEqualTo(VALID);
                        assertThat(rejected.sourceBoundIssue().code()).isEqualTo("UNSUPPORTED_CAPABILITY");
                        assertThat(rejected.sourceBoundIssue().path()).isEqualTo("/practicePlan/rationale/proposedPractice");
                    });
        }
        String negative = candidate("상품 선택 여부는 미확인입니다.", "시각적 강조 없이 기존 글 안내를 읽는지 관찰합니다.").toString();
        assertThatCode(() -> AnalysisPlanSemanticReview.validate(mapper, VALID, negative, source)).doesNotThrowAnyException();
    }

    @Test void typed_product_station_and_kind_repairs_are_unique_quote_only_and_cannot_change_other_facts() {
        String old = "흰 우유 2개가 produce에 위치한 조건입니다. 기존 수량은 2개입니다.";
        var candidate = candidate(old, "목록 확인");
        for (String code : List.of("PRODUCT_STATION_MISMATCH", "STATION_KIND_MISMATCH")) {
            var review = mapper.createObjectNode().put("verdict", "REPAIR");
            review.putArray("checkedDimensions").add("STATION_IDENTITY");
            review.putArray("issues").addObject().put("code", code).put("path", PATH).put("quote", "produce에 위치한")
                    .put("explanation", "제공된 위치 원본과 맞지 않습니다.");
            var response = mapper.createObjectNode();
            response.putArray("patches").addObject().put("path", "/analysis" + PATH).put("value", old.replace("produce에 위치한", "fresh에 위치한"));
            var after = mapper.readTree(ReviewSemanticTextPatch.apply(mapper, candidate.toString(), review.toString(), response.toString()));
            assertThat(after.at("/analysis" + PATH).asString()).endsWith("기존 수량은 2개입니다.");
            ((ObjectNode)after.at("/analysis/findings/0/observation/0")).set("text", candidate.at("/analysis" + PATH));
            assertThat(after).isEqualTo(candidate);
            var invalid = response.deepCopy();
            ((ObjectNode)invalid.path("patches").get(0)).put("value", old.replace("produce에 위치한", "fresh에 위치한").replace("기존 수량은 2개", "기존 수량은 3개"));
            assertThatThrownBy(() -> ReviewSemanticTextPatch.apply(mapper, candidate.toString(), review.toString(), invalid.toString()))
                    .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
            review.put("verdict", "VALID");
            assertThatThrownBy(() -> ReviewSemanticTextPatch.target(mapper, candidate.toString(), review.toString()))
                    .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
        }
    }

    @Test void proof_output_reservation_grows_without_changing_any_candidate_value() {
        var candidate = candidate("fresh 매대 근처에 접근했습니다.", "직원 수를 2명으로 배치합니다."); String original = candidate.toString();
        String source = source("fresh", false).toString();
        int output = SourceBoundReviewChecks.outputTokens(mapper, original, source);
        assertThat(output).isGreaterThan(AnalysisPlanSemanticReview.OUTPUT_TOKENS);
        assertThat(candidate.toString()).isEqualTo(original);
        assertThat(new AnalysisTokenBudget().total(AnalysisPlanSemanticReview.system(), AnalysisPlanSemanticReview.prompt(mapper, source, original), output) + 512)
                .isLessThanOrEqualTo(24000);
    }

    @Test void even_numbers_inside_a_reviewers_quote_cannot_be_changed_by_the_model_patch() {
        String text="흰 우유 2개가 produce에 위치한 조건입니다.";var candidate=candidate(text,"목록 확인");
        var review=mapper.createObjectNode().put("verdict","REPAIR");review.putArray("issues").addObject()
                .put("code","PRODUCT_STATION_MISMATCH").put("path",PATH).put("quote",text);
        var patch=mapper.createObjectNode();patch.putArray("patches").addObject().put("path","/analysis"+PATH)
                .put("value","흰 우유 3개가 fresh에 위치한 조건입니다.");
        assertThatThrownBy(()->ReviewSemanticTextPatch.apply(mapper,candidate.toString(),review.toString(),patch.toString()))
                .hasMessage("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
    }

    private ObjectNode candidate(String observation, String plan) {
        var root = mapper.createObjectNode(); var analysis = root.putObject("analysis");
        analysis.putArray("summary"); analysis.putArray("uncertainties"); analysis.putArray("sessionAssessments").addObject().put("judgment", "FAILURE");
        var finding = analysis.putArray("findings").addObject().put("id", "F1").put("suggestedSupport", "");
        finding.putArray("observation").addObject().put("text", observation).putArray("evidenceEventIds").add("E1");
        finding.putArray("interpretation"); finding.putArray("alternativeExplanations");
        analysis.putObject("practicePlan").put("recommendedDifficulty", 1).putObject("rationale").put("proposedPractice", plan).putArray("unknownCauseIndexes");
        return root;
    }
    private ObjectNode source(String station, boolean coordinates) {
        var root = mapper.createObjectNode();
        var event = root.putArray("sourceEventDetails").addObject().put("id", "E1").put("sessionId", "S1").put("timeMs", 100).put("eventCode", "SHOP.MOVEMENT_SAMPLED");
        if (station != null) event.putObject("recordedStation").put("stationId", station).put("kind", station.equals("fresh") ? "shelf" : "exit");
        if (coordinates) event.put("x", 495).put("y", 308);
        var session = root.putObject("sourceMovementContext").putArray("sessions").addObject().put("sessionId", "S1");
        session.putArray("movementEventDetails");
        session.putArray("sceneSources").addObject().put("sourceEventId", "E1").putObject("recordedGeometry").putObject("stations").putObject("fresh").put("x", 500).put("y", 308);
        session.putArray("collectorContexts").addObject().put("sourceEventId", "E1").putObject("movementContext").put("interactionRadius", 105);
        return root;
    }
    /** Synthetic reviewer fixture only; never stored or treated as an actual model response. */
    private String validChecks(String candidate, String source, boolean coordinates) {
        var descriptor = SourceBoundReviewChecks.describe(mapper, candidate, source);
        var review = (ObjectNode)mapper.readTree(VALID); var bound = review.putObject("sourceBoundChecks"); var stations = bound.putArray("stations");
        var original = mapper.readTree(source);
        for (var target : descriptor.path("stationClaims")) {
            var row = stations.addObject().put("path", target.path("path").asString()).put("quote", target.path("quote").asString()).put("status", coordinates ? "COORDINATES" : "RECORDED");
            var proof = row.putArray("proofs").addObject().put("eventId", "E1").put("stationId", "fresh");
            if (!coordinates) proof.put("sourcePath", "/sourceEventDetails/0/recordedStation").set("sourceValue", original.at("/sourceEventDetails/0/recordedStation"));
            else {
                proof.put("positionPath", "/sourceEventDetails/0"); proof.putObject("positionValue").put("x", 495).put("y", 308);
                proof.put("stationPath", "/sourceMovementContext/sessions/0/sceneSources/0/recordedGeometry/stations/fresh"); proof.putObject("stationValue").put("x", 500).put("y", 308);
                proof.put("radiusPath", "/sourceMovementContext/sessions/0/collectorContexts/0/movementContext/interactionRadius").put("radiusValue", 105);
            }
        }
        var units = bound.putArray("capabilities");
        for (var unit : descriptor.path("capabilityUnits")) {
            var row = units.addObject().put("path", unit.path("path").asString()).put("quote", unit.path("quote").asString()); var proofs = row.putArray("proofs");
            for (var field : unit.path("fieldPaths")) proofs.addObject().put("fieldPath", field.asString())
                    .set("sourceValue", descriptor.path("implementedCapabilities").path("fields").path(field.asString()));
        }
        return review.toString();
    }
}
