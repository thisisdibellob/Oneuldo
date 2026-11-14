package oneuldo.behaviorlog.analysis.service;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class AnalysisFailureClassificationTest {
    @Test void real_request_budget_failure_keeps_required_and_limit_details() {
        var failure=catchThrowableOfType(() -> new AnalysisTokenBudget().requireFits(
                "source", "original evidence", 16, 1, "ANALYSIS_INPUT_EXCEEDS_LIMIT"),
                oneuldo.ai.exception.AiInputLimitException.class);
        assertThat(failure.required()).isGreaterThan(failure.limit());
        assertThat(AiBehaviorAnalysisService.failureStatus(failure)).isEqualTo("INPUT_TOO_LARGE");
        assertThat(AiBehaviorAnalysisService.failureCode(failure))
                .contains("ANALYSIS_INPUT_EXCEEDS_LIMIT", "required=", "limit=");
    }
    @Test void actual_station_patch_validation_failure_is_not_reported_as_token_overflow() {
        var mapper=JsonMapper.builder().build();
        var failure=catchThrowableOfType(() -> ReviewStationPatch.apply(mapper,
                "{\"analysis\":{},\"stationClaims\":[{\"eventId\":\"E1\",\"stationId\":\"checkout\",\"kind\":\"checkout\"}]}",
                "{\"patches\":[{\"path\":\"/stationClaims/0\",\"value\":null}]}"), IllegalArgumentException.class);
        assertThat(failure).hasMessage("INVALID_REVIEW_STATION_PATCH");
        assertThat(AiBehaviorAnalysisService.failureStatus(failure)).isEqualTo("FAILED");
        assertThat(AiBehaviorAnalysisService.failureCode(failure)).isEqualTo("INVALID_REVIEW_STATION_PATCH");
    }
    @Test void unrelated_failure_text_is_not_exposed_as_a_public_error_code() {
        var failure=new IllegalArgumentException("Authorization: Bearer dummy-classifier-test");
        assertThat(AiBehaviorAnalysisService.failureStatus(failure)).isEqualTo("FAILED");
        assertThat(AiBehaviorAnalysisService.failureCode(failure)).isEqualTo("CHUNK_ANALYSIS_FAILED");
    }
}
