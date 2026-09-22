package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.JsonNode;

/** Checks review coverage, reference membership and source order, never the truth of prose. */
public final class ReviewEvidenceChecks {
    private ReviewEvidenceChecks() {}

    public static void validate(JsonNode analysis, JsonNode checks, AnalysisReferences refs) {
        Map<String, Set<String>> paths = new LinkedHashMap<>();
        Map<String, List<String>> observationReferences = new LinkedHashMap<>();
        Set<String> mustCite = new HashSet<>();
        int i = 0;
        for (var finding : analysis.path("findings")) {
            Set<String> ids = ids(finding.path("evidenceEventIds"));
            // Inline citations are references too. Checking their order does not interpret Korean prose.
            var mentioned = new ArrayList<String>();
            var matcher = java.util.regex.Pattern.compile("(?<![A-Za-z0-9])E[1-9][0-9]*(?![A-Za-z0-9])")
                    .matcher(finding.path("observation").asString());
            while (matcher.find()) mentioned.add(matcher.group());
            if (mentioned.isEmpty()) throw new IllegalArgumentException("MISSING_OBSERVATION_EVENT_REFERENCES");
            refs.validateEventOrder(mentioned);
            if (!ids.containsAll(mentioned)) throw new IllegalArgumentException("OBSERVATION_EVENT_NOT_CITED");
            String prefix = "/findings/" + i++;
            paths.put(prefix + "/observation", ids);
            observationReferences.put(prefix + "/observation", mentioned);
            mustCite.add(prefix + "/observation");
            paths.put(prefix + "/interpretation", ids);
            for (int j = 0; j < finding.path("alternativeExplanations").size(); j++) {
                String path = prefix + "/alternativeExplanations/" + j;
                paths.put(path, ids); mustCite.add(path);
            }
        }
        i = 0;
        for (var assessment : analysis.path("sessionAssessments")) {
            Set<String> ids = ids(assessment.path("evidenceEventIds"));
            String path = "/sessionAssessments/" + i++ + "/explanation";
            paths.put(path, ids); mustCite.add(path);
        }
        // A summary may cite source context (e.g. the mission) absent from individual findings.
        // Its claimChecks entry is its own evidence list; source existence/order still apply.
        paths.put("/summary", refs.eventIds());
        Set<String> seen = new HashSet<>();
        for (var check : checks) {
            if (!check.isArray() || check.size() != 2 || !check.get(0).isString() || !check.get(1).isArray())
                throw new IllegalArgumentException("INVALID_REVIEW_CHECK");
            String path = check.get(0).asString();
            // Accept an absolute envelope pointer and the documented analysis-relative pointer.
            if (path.startsWith("/analysis/")) path = path.substring("/analysis".length());
            // A check written before generation may record a deleted alternative with no evidence.
            // It never satisfies coverage of any actual final claim, and cannot hide a retained alternative.
            if (!paths.containsKey(path) && check.get(1).isEmpty()
                    && path.matches("/findings/[0-9]+/alternativeExplanations(?:/[0-7])?")) {
                int index = Integer.parseInt(path.split("/")[2]);
                if (index < analysis.path("findings").size()
                        && analysis.path("findings").get(index).path("alternativeExplanations").isEmpty()) continue;
            }
            if (!paths.containsKey(path) || !seen.add(path)) throw new IllegalArgumentException("INVALID_REVIEW_PATH");
            List<String> evidence = new ArrayList<>();
            for (var id : check.get(1)) {
                if (!id.isString()) throw new IllegalArgumentException("INVALID_REVIEW_EVIDENCE");
                evidence.add(id.asString());
            }
            refs.validateEventOrder(evidence);
            var allowed = paths.get(path);
            if (!allowed.containsAll(evidence))
                throw new ReviewEvidenceException("REVIEW_EVIDENCE_NOT_CITED", path,
                        evidence.stream().filter(id -> !allowed.contains(id)).toList());
            if (mustCite.contains(path) && evidence.isEmpty()) throw new IllegalArgumentException("MISSING_REVIEW_EVIDENCE");
            var mentioned = observationReferences.getOrDefault(path, List.of());
            if (!evidence.containsAll(mentioned))
                throw new ReviewEvidenceException("REVIEW_OBSERVATION_NOT_COVERED", path,
                        mentioned.stream().filter(id -> !evidence.contains(id)).toList());
        }
        if (!seen.equals(paths.keySet())) throw new IllegalArgumentException("MISSING_REVIEW_CLAIM_CHECK");
    }

    private static Set<String> ids(JsonNode array) {
        Set<String> result = new HashSet<>();
        for (var id : array) result.add(id.asString());
        return result;
    }
}
