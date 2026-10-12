package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class ActualClaimPatchBudgetTest {
    @Test void full_actual_source_and_candidate_fit_with_exact_annotation_diagnostics_and_short_retry() throws Exception {
        var path=Path.of("../output/persona45-mcp-20261013/adult-minjae-unit-support-research-v2-1/baseline-pre/review-repair-diagnostics/latest-claim-patch-budget-failure.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
        var mapper=JsonMapper.builder().build();var run=mapper.readTree(Files.readString(path));
        var attempts=run.path("attempts");if(attempts.isString())attempts=mapper.readTree(attempts.asString());
        var failure=mapper.treeToValue(attempts.get(attempts.size()-2).path("validationFailure"),ReviewEvidenceException.Details.class);
        var previous=attempts.get(attempts.size()-1).path("inputPrompt").asString();
        String marker="\nCandidate (all values retained): ";int split=previous.indexOf(marker);assertThat(split).isGreaterThan(0);
        String source=previous.substring(0,split),candidate=previous.substring(split+marker.length(),previous.indexOf("\nReported technical error:"));
        var prompt=ReviewClaimTextPatch.prompt(mapper,source,candidate,failure);
        String retry="\nRepair attempt 2: previous patch failed INVALID_REVIEW_CLAIM_TEXT_PATCH. Remove every annotationRemoval substring; copy all other prose literally. Each allowedTextPath exactly once. Original sources/candidate and evidence arrays are unchanged.";
        int required=QwenTokenCounter.inputTokens(ReviewClaimTextPatch.SYSTEM,prompt+retry)+ReviewClaimTextPatch.OUTPUT_TOKENS+32;
        assertThat(required).isLessThanOrEqualTo(24000);
        assertThat(prompt).startsWith(source+marker+candidate).contains("annotationRemoval", "(E7 등)");
        assertThat(mapper.readTree(prompt.substring(0,split))).isEqualTo(mapper.readTree(source));
        Files.writeString(Path.of("../output/persona45-mcp-20261013/actual-claim-patch-retry-budget.json"),mapper.writeValueAsString(java.util.Map.of("requiredTokens",required,"limit",24000,"allOriginalSourcesAndCandidateRetained",true,"noNewPlayOrModelCall",true)));
    }
}
