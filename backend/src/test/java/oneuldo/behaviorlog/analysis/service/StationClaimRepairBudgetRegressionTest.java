package oneuldo.behaviorlog.analysis.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

class StationClaimRepairBudgetRegressionTest {
    @Test void actual_failed_station_retry_fits_without_dropping_source_or_changing_the_assessment() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var record = mapper.readTree(Files.readString(Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/group-02/baseline-valid/analysis-raw-audit-failed-v44-01.json")));
        var attempt = record.path("attempts").get(record.path("attempts").size()-1);
        String source = attempt.path("inputPrompt").asString();
        String system = attempt.path("systemPrompt").asString();
        String correction = StationClaimRepairPrompt.build(mapper,
                new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/1", List.of("E71")));
        String submitted = source + "\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요." + correction;
        assertThat(submitted).startsWith(source);
        assertThat(QwenTokenCounter.inputTokens(system, submitted) + attempt.path("outputMax").asInt()).isLessThanOrEqualTo(18000);
        assertThat(correction).contains("E71", "stationId", "UNKNOWN", "성패를 지우거나 바꾸어 통과하지");
    }
}
