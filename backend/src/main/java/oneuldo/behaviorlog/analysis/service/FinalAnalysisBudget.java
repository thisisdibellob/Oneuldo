package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import tools.jackson.databind.ObjectMapper;

/** Plans two separate requests; the actual draft/review are still checked before transmission. */
public final class FinalAnalysisBudget {
    private FinalAnalysisBudget() {}

    public record Estimate(int draftRequest, int reviewRequest, String preparedReview) {
        public Estimate(int draftRequest, int reviewRequest) { this(draftRequest, reviewRequest, null); }
        public int required() { return Math.max(draftRequest, reviewRequest); }
    }

    public static Estimate estimate(ObjectMapper mapper, AnalysisTokenBudget budget, String system,
            String source, AnalysisReferences refs, boolean review, String retry) {
        return estimate(mapper,budget,system,source,refs,review,false,retry);
    }
    public static Estimate estimate(ObjectMapper mapper, AnalysisTokenBudget budget, String system,
            String source, AnalysisReferences refs, boolean review, boolean directReview, String retry) {
        int output = budget.finalOutputTokens();
        int draftCost = review && directReview ? 0 : budget.total(system, source + retry, output);
        if (!review) return new Estimate(draftCost, 0);
        // Count the current review instructions/source instead of an arbitrary 1,500-token constant.
        // The independent review never receives draftToReview; do not reserve a second copy of its output.
        // Keep the actual review output reservation and a separate framing margin.
        var empty = new AiBehaviorAnalysis("", List.of(), List.of(), List.of(), null, List.of());
        String reviewSource = AnalysisReviewPrompt.build(mapper, source, empty, refs);
        int reviewCost = budget.total(AnalysisReviewPrompt.system(), reviewSource + retry, output) + 256;
        return new Estimate(draftCost, reviewCost, directReview ? reviewSource : null);
    }
}
