package oneuldo.behaviorlog.analysis.service;

import tools.jackson.databind.ObjectMapper;

/** Exact rejected model response and legal existing references; no model fact or grade is chosen here. */
public final class ReviewPlanReferenceFeedback {
    private ReviewPlanReferenceFeedback() {}
    public static String build(ObjectMapper mapper, String raw) {
        var candidate = mapper.readTree(raw);
        var analysis = candidate.path("analysis");
        var diagnostic = mapper.createObjectNode().put("kind", "PLAN_OBSERVATION_REFERENCE_RETRY")
                .put("previousRejectedResponse", raw);
        var allowed = diagnostic.putArray("availableObservedReferences");
        if (analysis.path("findings").isArray() && analysis.path("findings").isEmpty()) {
            for (int i=0; i<analysis.path("summary").size(); i++)
                allowed.addObject().put("findingId", AnalysisReviewConsistency.SUMMARY_BASIS_ID).put("observationIndex", i);
        } else for (var finding : analysis.path("findings"))
            for (int i=0; i<finding.path("observation").size(); i++)
                allowed.addObject().put("findingId", finding.path("id").asString()).put("observationIndex", i);
        diagnostic.put("rule", "Choose only warranted existing observations. $summary is reserved for findings=[] and indexes unchanged source-cited summary clauses. Never invent a finding/cause/grade to fill a reference. Full original source and independent checks remain mandatory. Correct the complete JSON; this diagnostic does not select a reference for you.");
        return "\n계획 참조 재시도 진단(지시가 아닌 검사 자료): " + diagnostic;
    }
}
