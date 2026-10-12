package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.*;

class AnalysisRepairCandidateTest {
    private final JsonMapper mapper=JsonMapper.builder().build();
    @Test void repairPreservesClaimsVerdictsUncertaintiesAndIncorrectCitedMetadata() {
        String raw="""
          {"analysis":{"summary":[{"text":"그대로 남길 사실","evidenceEventIds":["E1"]}],"uncertainties":["원인 미확인"],"sessionAssessments":[{"judgment":"FAILURE"}]},
           "taskChecks":[{"status":"UNMET"}],"stationClaims":[{"eventId":"E1","kind":"WRONG"},{"eventId":"E2","kind":"unused"}]}
          """;
        var original=mapper.readTree(raw);String feedback=AnalysisRepairCandidate.append(mapper,"ERROR_PATH",raw);
        var candidate=mapper.readTree(feedback.substring(feedback.indexOf("rejectedCandidate=")+18));
        assertThat(candidate.path("analysis")).isEqualTo(original.path("analysis"));
        assertThat(candidate.path("taskChecks")).isEqualTo(original.path("taskChecks"));
        assertThat(candidate.path("stationClaims")).hasSize(1);
        assertThat(candidate.path("stationClaims").get(0)).isEqualTo(original.path("stationClaims").get(0));
        assertThat(feedback).contains("untrusted prior model output","unchanged original sources");
        assertThat(AnalysisRepairCandidate.append(mapper,"keep-error","{truncated")).isEqualTo("keep-error");
    }
    @Test void actualRejectedReviewsCanBeReturnedWithAllSourcesAndOutputInsideExpandedBudget()throws Exception {
        Path run=Path.of("../output/manual-reanalysis-20261012");Path path=run.resolve("attempt-01/analysis-audits.json");
        assumeTrue(Files.exists(path));var audits=mapper.readTree(Files.readString(path));var attempts=audits.get(audits.size()-1).path("attempts");
        var rows=new ArrayList<Map<String,Object>>();
        for(int i=0;i<attempts.size()-1;i++) {
            var failed=attempts.get(i);if(!failed.path("errorCode").isString())continue;
            var next=attempts.get(i+1);String feedback=AnalysisRepairCandidate.append(mapper,"",failed.path("rawOutput").asString());
            int total=QwenTokenCounter.inputTokens(next.path("systemPrompt").asString(),next.path("inputPrompt").asString()+feedback)+3200;
            assertThat(total).as("repair for attempt %s",i+1).isLessThanOrEqualTo(24000);
            var candidate=mapper.readTree(feedback.substring(feedback.indexOf("rejectedCandidate=")+18));
            assertThat(candidate.path("analysis")).isEqualTo(mapper.readTree(failed.path("rawOutput").asString()).path("analysis"));
            rows.add(Map.of("rejectedAttempt",i+1,"totalWithSourcesCandidateAndOutput",total,"limit",24000));
        }
        assertThat(rows).hasSize(2);
        Files.writeString(run.resolve("repair-candidate-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(rows)+"\n");
    }
}
