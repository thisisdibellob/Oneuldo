package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Test-only migration of the initial array-shaped real responses. No prose or evidence is repaired. */
@EnabledIfEnvironmentVariable(named="AI_VALIDATOR_REPLAY", matches="true")
class AttachedReviewReplayTest {
    @Test void both_real_array_responses_preserve_every_claim_and_reference_under_the_uniform_contract() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var input=mapper.readValue(Files.readString(Path.of("../output/analysis-request-2026-09-18/input.json")),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(mapper,input);
        var report=mapper.readTree(Files.readString(Path.of("../output/output-consistency-2026-09-18/live-first-format.json")));
        for(var attempt:report.path("attempts")) {
            if(attempt.path("number").asInt()<4)continue;
            var original=(ObjectNode)mapper.readTree(attempt.path("rawOutput").asString());
            var candidate=original.deepCopy();
            // Only the TEST copy's version changes. Live parsing rejects old format markers.
            candidate.put("reviewFormat",ReviewedClaimOutput.FORMAT);
            var normalized=mapper.readTree(AnalysisReviewPrompt.reviewedAnalysis(mapper,candidate.toString(),refs));
            new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(normalized.toString()),input);
            var expected=new ArrayList<String>();
            original.path("analysis").path("summary").forEach(c->expected.add(c.path("text").asString()));
            assertThat(normalized.path("summary").asString()).isEqualTo(String.join(" ",expected));
            int i=0;
            for(var finding:original.path("analysis").path("findings")) {
                var actual=normalized.path("findings").get(i++);
                var evidence=new HashSet<String>();
                for(String field:List.of("observation","interpretation","alternativeExplanations")) {
                    for(var claim:finding.path(field)) {
                        assertThat(actual.path(field).toString()).contains(claim.path("text").asString());
                        claim.path("evidenceEventIds").forEach(id->evidence.add(id.asString()));
                    }
                }
                var actualIds=new HashSet<String>();actual.path("evidenceEventIds").forEach(id->actualIds.add(id.asString()));
                assertThat(actualIds).isEqualTo(evidence);
            }
            assertThat(original.path("reviewFormat").asString()).isEqualTo("claim-evidence-v1");
        }
    }
}
