package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.JsonNode;

/** Checks the AI's own condition judgments and literal source references; never calculates a player's answer. */
public final class AnalysisReviewConsistency {
    public static final String FORMAT = "claim-evidence-v4";
    public static final String SUMMARY_BASIS_ID = "$summary";
    public static final Set<String> CAPABILITIES = Set.of("TEXT_GUIDANCE", "ITEM_QUANTITY_BUDGET", "TIME_LIMIT", "SHELF_CATEGORY_ORDER");
    private AnalysisReviewConsistency() {}

    public static void validate(JsonNode envelope, AnalysisReferences refs) {
        envelope=AnalysisReviewWire.expand(envelope,refs);
        if (!FORMAT.equals(envelope.path("reviewFormat").asString())) fail("CURRENT_REVIEW_FORMAT_REQUIRED", "/reviewFormat");
        var checks = envelope.path("taskChecks");
        var assessments = envelope.path("analysis").path("sessionAssessments");
        if (!checks.isArray() || checks.size() != assessments.size()) fail("REVIEW_TASK_CHECK_COVERAGE", "/taskChecks");
        Set<String> seen = new HashSet<>();
        int i = 0;
        for (var check : checks) {
            String path = "/taskChecks/" + i++;
            if (!check.isObject() || !check.propertyNames().equals(Set.of("sessionId", "objectives", "budget", "submission"))
                    || !seen.add(check.path("sessionId").asString())) fail("REVIEW_TASK_CHECK_COVERAGE", path);
            JsonNode session = null, assessment = null;
            for (var row : refs.reviewSource().path("sessions")) if (row.path("sessionId").equals(check.path("sessionId"))) session = row;
            for (var row : assessments) if (row.path("sessionId").equals(check.path("sessionId"))) assessment = row;
            if (session == null || assessment == null) fail("REVIEW_TASK_CHECK_COVERAGE", path);
            Set<String> goals = new HashSet<>(), supplied = new HashSet<>();
            Set<String> sessionEvents = new HashSet<>();
            for (var event : session.path("events")) {
                sessionEvents.add(event.path("behaviorLogId").asString());
                for (var goal : event.path("payload").path("marketContent").path("sceneSnapshot").path("mission").path("objectives"))
                    goals.add(goal.path("productId").asString());
            }
            boolean unmet = false, unknown = goals.isEmpty();
            if (!check.path("objectives").isArray()) fail("REVIEW_TASK_CHECK_COVERAGE", path + "/objectives");
            for (var objective : check.path("objectives")) {
                if (!objective.isObject() || !objective.propertyNames().equals(Set.of("productId", "status", "evidenceEventIds"))
                        || !supplied.add(objective.path("productId").asString())) fail("REVIEW_TASK_CHECK_COVERAGE", path + "/objectives");
                status(objective, sessionEvents, path + "/objectives");
                unmet |= "UNMET".equals(objective.path("status").asString());
                unknown |= "UNKNOWN".equals(objective.path("status").asString());
            }
            if (!goals.equals(supplied)) fail("REVIEW_TASK_CHECK_COVERAGE", path + "/objectives");
            for (String field : List.of("budget", "submission")) {
                var condition = check.path(field);
                if (!condition.isObject() || !condition.propertyNames().equals(Set.of("status", "evidenceEventIds"))) fail("REVIEW_TASK_CHECK_COVERAGE", path + "/" + field);
                status(condition, sessionEvents, path + "/" + field);
                unmet |= "UNMET".equals(condition.path("status").asString());
                unknown |= "UNKNOWN".equals(condition.path("status").asString());
            }
            String judgment = assessment.path("judgment").asString();
            if (("SUCCESS".equals(judgment) && (unmet || unknown))
                    || ("FAILURE".equals(judgment) && !unmet) || ("UNDETERMINED".equals(judgment) && (unmet || !unknown)))
                fail("REVIEW_TASK_JUDGMENT_CONTRADICTION", path);
        }
        var stations = refs.recordedStations();
        var claims = envelope.path("stationClaims");
        if (!claims.isArray() || claims.size() > stations.size()) fail("REVIEW_STATION_CLAIM_INVALID", "/stationClaims");
        Set<String> events = new HashSet<>();
        int stationClaimIndex = 0;
        for (var claim : claims) {
            String id = claim.path("eventId").asString();
            if (!claim.isObject() || !claim.propertyNames().equals(Set.of("eventId", "stationId", "kind"))
                    || !events.add(id) || !stations.containsKey(id)
                    || !claim.path("stationId").equals(stations.get(id).path("stationId"))
                    || !claim.path("kind").equals(stations.get(id).path("kind")))
                throw new ReviewEvidenceException("REVIEW_STATION_CLAIM_INVALID", "/stationClaims/" + stationClaimIndex, List.of(id));
            stationClaimIndex++;
        }
        // Every cited station event must be typed, even when the recorded type is UNKNOWN.
        Set<String> cited = new HashSet<>(); collectEvidence(envelope.path("analysis"), cited);
        var missingStations = cited.stream().filter(id -> stations.containsKey(id) && !events.contains(id))
                .sorted(java.util.Comparator.comparingInt(id -> Integer.parseInt(id.substring(1)))).toList();
        if (!missingStations.isEmpty())
            throw new ReviewEvidenceException("REVIEW_STATION_CLAIM_COVERAGE", "/stationClaims", missingStations);
        var basis = envelope.path("analysis").path("practicePlan").path("rationale");
        if (!basis.isObject() || !basis.propertyNames().equals(Set.of("observed", "unknownCauseIndexes", "proposedPractice", "baselineDifficulty", "supportCapabilities"))
                || !basis.path("observed").isArray() || basis.path("observed").isEmpty() || basis.path("observed").size() > 6
                || !basis.path("unknownCauseIndexes").isArray() || basis.path("unknownCauseIndexes").size() > 5
                || !basis.path("proposedPractice").isString() || basis.path("proposedPractice").asString().isBlank()
                || basis.path("proposedPractice").asString().length() > 600) fail("REVIEW_PLAN_BASIS_INVALID", "/practicePlan/rationale");
        Set<String> observations = new HashSet<>();
        for (var reference : basis.path("observed")) {
            if (!reference.isObject() || !reference.propertyNames().equals(Set.of("findingId", "observationIndex"))
                    || !reference.path("findingId").isString() || !reference.path("observationIndex").isIntegralNumber()
                    || !reference.path("observationIndex").canConvertToInt()) fail("REVIEW_PLAN_OBSERVATION_REFERENCE", "/practicePlan/rationale/observed");
            int index = reference.path("observationIndex").asInt();
            if (SUMMARY_BASIS_ID.equals(reference.path("findingId").asString())) {
                var analysis = envelope.path("analysis");
                var summary = analysis.path("summary");
                if (!analysis.path("findings").isArray() || !analysis.path("findings").isEmpty()
                        || !summary.isArray() || index < 0 || index >= summary.size()
                        || !observations.add(SUMMARY_BASIS_ID + ":" + index))
                    fail("REVIEW_PLAN_OBSERVATION_REFERENCE", "/practicePlan/rationale/observed");
                continue;
            }
            JsonNode finding = null;
            for (var row : envelope.path("analysis").path("findings")) if (row.path("id").equals(reference.path("findingId"))) finding = row;
            if (finding == null || index < 0 || index >= finding.path("observation").size()
                    || !observations.add(reference.path("findingId").asString() + ":" + index)) fail("REVIEW_PLAN_OBSERVATION_REFERENCE", "/practicePlan/rationale/observed");
        }
        Set<Integer> causes = new HashSet<>();
        for (var reference : basis.path("unknownCauseIndexes"))
            if (!reference.isIntegralNumber() || !reference.canConvertToInt() || reference.asInt() < 0
                    || reference.asInt() >= envelope.path("analysis").path("uncertainties").size()
                    || !causes.add(reference.asInt())) fail("REVIEW_PLAN_UNCERTAINTY_REFERENCE", "/practicePlan/rationale/unknownCauseIndexes");
        var capabilities = basis.path("supportCapabilities");
        if (!capabilities.isArray() || capabilities.isEmpty() || capabilities.size() > CAPABILITIES.size()) fail("REVIEW_UNSUPPORTED_CAPABILITY", "/practicePlan/rationale/supportCapabilities");
        Set<String> unique = new HashSet<>();
        for (var capability : capabilities) if (!CAPABILITIES.contains(capability.asString()) || !unique.add(capability.asString()))
            fail("REVIEW_UNSUPPORTED_CAPABILITY", "/practicePlan/rationale/supportCapabilities");
        var baseline = basis.path("baselineDifficulty");
        if (!baseline.isNull()) {
            boolean recorded = false;
            for (var session : refs.reviewSource().path("sessions")) for (var event : session.path("events"))
                recorded |= baseline.isIntegralNumber() && baseline.equals(event.path("payload").path("marketContent").path("sceneSnapshot").path("mission").path("difficulty"));
            if (!recorded) fail("REVIEW_UNRECORDED_DIFFICULTY_BASELINE", "/practicePlan/rationale/baselineDifficulty");
        }
    }
    private static void status(JsonNode condition, Set<String> events, String path) {
        String status = condition.path("status").asString();
        var ids = condition.path("evidenceEventIds");
        if (!Set.of("MET", "UNMET", "UNKNOWN").contains(status) || !ids.isArray() || ids.size() > 30
                || (!"UNKNOWN".equals(status) && ids.isEmpty())) fail("REVIEW_TASK_CHECK_INVALID", path);
        Set<String> seen = new HashSet<>();
        for (var id : ids) if (!id.isString() || !events.contains(id.asString()) || !seen.add(id.asString())) fail("REVIEW_TASK_CHECK_INVALID", path);
    }
    private static void collectEvidence(JsonNode node, Set<String> result) {
        if (node.isObject()) {
            for (String field : node.propertyNames()) {
                if (field.equals("evidenceEventIds")) node.path(field).forEach(id -> result.add(id.asString()));
                else collectEvidence(node.path(field), result);
            }
        } else if (node.isArray()) node.forEach(value -> collectEvidence(value, result));
    }
    private static void fail(String code, String path) { throw new ReviewEvidenceException(code, path, List.of()); }
}
