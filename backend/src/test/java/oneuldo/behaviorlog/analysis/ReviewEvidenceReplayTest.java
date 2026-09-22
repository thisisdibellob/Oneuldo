package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Replays unmodified saved model responses. Requires local, ignored synthetic test data. */
@EnabledIfEnvironmentVariable(named="AI_VALIDATOR_REPLAY", matches="true")
class ReviewEvidenceReplayTest {
    @Test void prior_summary_false_rejection_no_longer_masks_missing_and_stale_finding_checks() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        Path source=Path.of("../output/analysis-request-2026-09-18");
        var input=mapper.readValue(Files.readString(source.resolve("input.json")),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(mapper,input);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var attempts=mapper.readTree(Files.readString(source.resolve("audit.json"))).path("attempts");
        String first=attempts.get(3).path("rawOutput").asString();
        assertThatThrownBy(()->AnalysisReviewPrompt.reviewedLegacyAnalysis(mapper,first,refs))
                .isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
                    assertThat(e.details().code()).isEqualTo("REVIEW_OBSERVATION_NOT_COVERED");
                    assertThat(e.details().path()).isEqualTo("/findings/2/observation");
                    assertThat(e.details().offendingIds()).containsExactly("E194");
                });
        // Deliberately repaired TEST copy: keep the original response intact. This is not a runtime repair.
        var completeCheck=mapper.readTree(first);
        for(var check:completeCheck.path("claimChecks")) if(check.get(0).asString().equals("/findings/2/observation"))
            ((tools.jackson.databind.node.ArrayNode)check).set(1,mapper.readTree("[\"E192\",\"E193\",\"E194\",\"E207\",\"E208\"]"));
        assertThatCode(()->validator.validate(refs.read(AnalysisReviewPrompt.reviewedLegacyAnalysis(mapper,completeCheck.toString(),refs)),input))
                .doesNotThrowAnyException();
        String second=attempts.get(4).path("rawOutput").asString();
        assertThatThrownBy(()->AnalysisReviewPrompt.reviewedLegacyAnalysis(mapper,second,refs))
                .isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
                    assertThat(e.details().code()).isEqualTo("REVIEW_EVIDENCE_NOT_CITED");
                    assertThat(e.details().path()).isEqualTo("/findings/0/observation");
                    assertThat(e.details().offendingIds()).containsExactly("E3","E4");
                });
    }
}
