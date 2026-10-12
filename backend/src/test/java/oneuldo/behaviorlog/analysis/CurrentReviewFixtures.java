package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.AnalysisReviewConsistency;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Explicit mock-provider conditions for single-event, no-goal orchestration tests; never used by live AI. */
final class CurrentReviewFixtures {
    private CurrentReviewFixtures() {}
    static ObjectNode envelope(ObjectMapper mapper, ObjectNode analysis) {
        var root = mapper.createObjectNode().put("reviewFormat", AnalysisReviewConsistency.FORMAT);
        root.putArray("reviewNotes"); root.set("analysis", analysis);
        var checks = root.putArray("taskChecks"); root.putArray("stationClaims");
        for (var assessment : analysis.path("sessionAssessments")) {
            var check = checks.addObject().put("sessionId", assessment.path("sessionId").asString());
            check.putArray("objectives");
            check.putObject("budget").put("status", "UNKNOWN").putArray("evidenceEventIds");
            boolean failure = "FAILURE".equals(assessment.path("judgment").asString());
            var submission = check.putObject("submission").put("status", failure ? "UNMET" : "UNKNOWN");
            var ids = submission.putArray("evidenceEventIds"); if (failure) ids.add("E1");
        }
        var plan = (ObjectNode)analysis.path("practicePlan");
        var basis = plan.putObject("rationale");
        basis.putArray("observed").addObject().put("findingId", analysis.path("findings").get(0).path("id").asString()).put("observationIndex", 0);
        basis.putArray("unknownCauseIndexes"); basis.put("proposedPractice", "목록과 구매 수를 비교하는 다음 조작을 관찰합니다.").putNull("baselineDifficulty");
        basis.putArray("supportCapabilities").add("TEXT_GUIDANCE");
        return root;
    }
    static String fromPlain(ObjectMapper mapper, String raw) {
        var analysis = (ObjectNode)mapper.readTree(raw);
        String summary = analysis.path("summary").asString();
        analysis.putArray("summary").add(claim(mapper, summary));
        for (var value : analysis.path("findings")) {
            var finding = (ObjectNode)value;
            String observation = finding.path("observation").asString(), interpretation = finding.path("interpretation").asString();
            var alternatives = finding.path("alternativeExplanations").deepCopy();
            finding.remove("evidenceEventIds");
            finding.putArray("observation").add(claim(mapper, observation));
            finding.putArray("interpretation").add(claim(mapper, interpretation));
            var array = finding.putArray("alternativeExplanations"); alternatives.forEach(text -> array.add(claim(mapper, text.asString())));
        }
        for (var value : analysis.path("sessionAssessments")) {
            var assessment = (ObjectNode)value; String explanation = assessment.path("explanation").asString();
            assessment.remove("evidenceEventIds"); assessment.putArray("explanation").add(claim(mapper, explanation));
        }
        return envelope(mapper, analysis).toString();
    }
    private static ObjectNode claim(ObjectMapper mapper, String text) {
        var claim = mapper.createObjectNode().put("text", text); claim.putArray("evidenceEventIds").add("E1"); return claim;
    }
}
