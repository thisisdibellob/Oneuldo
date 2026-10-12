package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ReviewStationRowPatchTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private static final Path DOSSIER = Path.of("../output/persona45-mcp-20261013/adult-minjae-unit-support-research-v2-1/baseline-pre/review-repair-diagnostics/latest-after-model-patch.json");

    @Test void row_patch_preserves_the_event_array_order_and_every_other_candidate_value() {
        var candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((ObjectNode)candidate.path("stationClaims").get(0)).put("kind","shelf");
        var original = candidate.deepCopy();
        String patch = "{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"UNKNOWN\"}}]}";
        var changed = fixture.mapper.readTree(ReviewStationPatch.apply(fixture.mapper,candidate.toString(),patch));
        assertThat(changed.path("stationClaims").size()).isEqualTo(original.path("stationClaims").size());
        assertThat(changed.at("/stationClaims/0/eventId")).isEqualTo(original.at("/stationClaims/0/eventId"));
        ((ObjectNode)changed).set("stationClaims",original.path("stationClaims"));
        assertThat(changed).isEqualTo(original);
        assertThat(candidate).isEqualTo(original);
    }

    @Test void row_patches_cannot_redirect_events_change_other_fields_repeat_paths_or_resize_the_array() {
        String candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification").toString();
        String row = "{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"UNKNOWN\"}";
        String valid = "{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":"+row+"}]}";
        for (String invalid : List.of(valid.replace("/stationClaims/0","/analysis/sessionAssessments/0"),
                valid.replace("\"E4\"","\"E999\""), valid.replace("/stationClaims/0","/stationClaims/01"),
                valid.replace("/stationClaims/0","/stationClaims/1"), valid.replace("/stationClaims/0","/stationClaims/9999999999999999"),
                "{\"patches\":[]}", "{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":"+row+"},{\"path\":\"/stationClaims/0\",\"value\":"+row+"}]}",
                "{\"patches\":[{\"path\":\"/stationClaims\",\"value\":[]},{\"path\":\"/stationClaims/0\",\"value\":"+row+"}]}"))
            assertThatThrownBy(() -> ReviewStationPatch.apply(fixture.mapper,candidate,invalid))
                    .hasMessage("INVALID_REVIEW_STATION_PATCH");
    }

    @Test void the_legacy_array_patch_stays_readable_and_wrong_model_values_still_fail_source_validation() {
        var candidate = new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        var input = fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class);
        var refs = new AnalysisReferences(fixture.mapper,input);
        String good = "{\"patches\":[{\"path\":\"/stationClaims\",\"value\":[{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"UNKNOWN\"}]}]}";
        var changed = fixture.mapper.readTree(ReviewStationPatch.apply(fixture.mapper,candidate.toString(),good));
        assertThatCode(() -> AnalysisReviewConsistency.validate(changed,refs)).doesNotThrowAnyException();
        String bad = "{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"shelf\"}}]}";
        var rejected = fixture.mapper.readTree(ReviewStationPatch.apply(fixture.mapper,candidate.toString(),bad));
        assertThatThrownBy(() -> AnalysisReviewConsistency.validate(rejected,refs)).hasMessage("REVIEW_STATION_CLAIM_INVALID");
    }

    @Test void actual_repeated_e1619_failure_had_a_correct_lookup_and_new_prompt_exposes_all_remaining_mismatches() throws Exception {
        var dossier = actual();
        var attempts = dossier.path("attempts");
        var review = attempt(attempts,17);
        var firstPatch = attempt(attempts,18);
        var repeated = attempt(attempts,19);
        assertThat(repeated.path("inputPrompt").asString()).contains("[{\"eventId\":\"E1619\",\"kind\":\"entrance\",\"stationId\":\"entrance\"}]");
        assertThat(firstPatch.path("rawOutput")).isEqualTo(repeated.path("rawOutput")).isEqualTo(attempt(attempts,20).path("rawOutput"));
        var repeatedValue = fixture.mapper.readTree(repeated.path("rawOutput").asString()).at("/patches/0/value/18");
        assertThat(repeatedValue.path("eventId").asString()).isEqualTo("E1619");
        assertThat(repeatedValue.path("stationId").asString()).isEqualTo("checkout");
        String candidate = ReviewStationPatch.apply(fixture.mapper,review.path("rawOutput").asString(),firstPatch.path("rawOutput").asString());
        var failure = new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID","/stationClaims/18",List.of("E1619"));
        String source = review.path("inputPrompt").asString();
        String prompt = ReviewStationPatch.prompt(fixture.mapper,source,candidate,failure);
        assertThat(prompt).startsWith(source).contains(candidate,"stationValueMismatches");
        for (int index : List.of(18,19,20,21)) assertThat(prompt).contains("\"candidatePath\":\"/stationClaims/"+index+"\"");
        for (String id : List.of("E1619","E2212","E2213","E2220"))
            assertThat(prompt).contains("\"literalSourceRow\":{\"eventId\":\""+id+"\",\"kind\":\"entrance\",\"stationId\":\"entrance\"}");
        assertThat(ReviewStationPatch.SYSTEM).contains("do not re-output unchanged rows","Check every stationValueMismatch");
    }

    @Test void simulated_model_row_patches_correct_the_actual_literal_mismatches_without_rewriting_analysis_or_sources() throws Exception {
        var attempts = actual().path("attempts");
        var review = attempt(attempts,17);
        String candidate = ReviewStationPatch.apply(fixture.mapper,review.path("rawOutput").asString(),attempt(attempts,18).path("rawOutput").asString());
        // Explicit mock-model response only; no actual model repair or READY is claimed.
        String response = """
                {"patches":[
                  {"path":"/stationClaims/18","value":{"eventId":"E1619","stationId":"entrance","kind":"entrance"}},
                  {"path":"/stationClaims/19","value":{"eventId":"E2212","stationId":"entrance","kind":"entrance"}},
                  {"path":"/stationClaims/20","value":{"eventId":"E2213","stationId":"entrance","kind":"entrance"}},
                  {"path":"/stationClaims/21","value":{"eventId":"E2220","stationId":"entrance","kind":"entrance"}}
                ]}
                """;
        var before = fixture.mapper.readTree(candidate);
        var after = fixture.mapper.readTree(ReviewStationPatch.apply(fixture.mapper,candidate,response));
        assertThat(after.path("stationClaims").size()).isEqualTo(before.path("stationClaims").size());
        for (int index=0;index<before.path("stationClaims").size();index++)
            if (!Set.of(18,19,20,21).contains(index))
                assertThat(after.path("stationClaims").get(index)).isEqualTo(before.path("stationClaims").get(index));
        var sources = new FinalSourceColumns(fixture.mapper).decode(fixture.mapper.readTree(review.path("inputPrompt").asString()).path("stationClaimSources"));
        for (var claim : after.path("stationClaims")) assertThat(sources).anySatisfy(row -> assertThat(row).isEqualTo(claim));
        ((ObjectNode)after).set("stationClaims",before.path("stationClaims"));
        assertThat(after).isEqualTo(before);
    }

    @Test void all_original_source_and_candidate_values_still_fit_the_actual_station_patch_budget() throws Exception {
        var attempts = actual().path("attempts");
        var review = attempt(attempts,17);
        String source = review.path("inputPrompt").asString();
        String candidate = review.path("rawOutput").asString();
        int first = tokens(source,candidate,new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID","/stationClaims/16",List.of("E1586")));
        candidate = ReviewStationPatch.apply(fixture.mapper,candidate,attempt(attempts,18).path("rawOutput").asString());
        int repeated = tokens(source,candidate,new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID","/stationClaims/18",List.of("E1619")));
        assertThat(first).isLessThanOrEqualTo(24000);
        assertThat(repeated).isLessThanOrEqualTo(24000);
        Files.writeString(DOSSIER.resolveSibling("station-row-patch-budget-verification.json"),fixture.mapper.writeValueAsString(Map.of(
                "firstRequiredTokens",first,"repeatedRequiredTokens",repeated,"limit",24000,
                "allOriginalSourcesAndCandidateValuesRetained",true,"actualModelRepairVerified",false)));
    }
    private int tokens(String source,String candidate,ReviewEvidenceException.Details failure) {
        String prompt = ReviewStationPatch.prompt(fixture.mapper,source,candidate,failure);
        assertThat(prompt).startsWith(source).contains(candidate);
        return QwenTokenCounter.inputTokens(ReviewStationPatch.SYSTEM,prompt)+ReviewStationPatch.OUTPUT_TOKENS+32;
    }
    private JsonNode actual() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(DOSSIER));
        return fixture.mapper.readTree(Files.readString(DOSSIER));
    }
    private JsonNode attempt(JsonNode attempts,int number) {
        for (var attempt : attempts) if (attempt.path("number").asInt() == number) return attempt;
        throw new AssertionError("Missing actual Minjae attempt "+number);
    }
}
