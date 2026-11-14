package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;

/** Narrow literal sources for comprehension/fault alternatives; never negates an unobserved possibility. */
public final class AlternativeCauseSourceChecks {
    public static final String VERSION = "alternative-cause-source-v2-reported-difficulty";
    public record Claim(String path, String quote, String category, List<String> evidenceEventIds,
            List<JsonNode> literalProofOptions) {}
    /** Trusted diagnostic origin for a bounded array repair, distinct from an actual model review. */
    public record FailureProof(String checkerVersion, String category, List<String> evidenceEventIds,
            List<JsonNode> citedOriginalSources) {}
    private record Event(String path, JsonNode value) {}
    private static final Pattern COMPREHENSION = Pattern.compile("(?:이해|인지|인식|사용법|조작법|읽는 법).{0,30}(?:못|모르|모를|어려|부족|불명확)|(?:못|모르).{0,15}(?:이해|사용법)");
    private static final Pattern FAULT = Pattern.compile("(?:시스템|기기|기술|앱|렌더링|네트워크).{0,20}(?:오류|고장|버그)|(?:장바구니|cart).{0,30}반영(?:되지|이 안| 안)");
    private static final Pattern REPORTED_DIFFICULTY = Pattern.compile("인지\\s*(?:부하|과부하)|인지적\\s*부담|처리\\s*(?:부하|부담)|조작(?:에|이|을|상|의)?\\s*(?:어려움|어려웠|어려워|곤란|문제)");
    private static final Pattern ATTRIBUTED = Pattern.compile("자기보고|보고|응답|기록");
    private AlternativeCauseSourceChecks() {}

    public static List<Claim> claims(ObjectMapper mapper, String candidate, JsonNode decodedSource) {
        var events = events(decodedSource); var result = new ArrayList<Claim>(); int findingIndex = 0;
        for (var finding : mapper.readTree(candidate).path("analysis").path("findings")) {
            int rowIndex = 0;
            for (var row : finding.path("alternativeExplanations")) {
                String text = row.path("text").asString(), category = REPORTED_DIFFICULTY.matcher(text).find() ? "REPORTED_DIFFICULTY" : COMPREHENSION.matcher(text).find() ? "COMPREHENSION" : FAULT.matcher(text).find() ? "TECHNICAL_FAULT" : null;
                String path = "/findings/" + findingIndex + "/alternativeExplanations/" + rowIndex++ + "/text";
                if (category == null) continue;
                var ids = new ArrayList<String>(); row.path("evidenceEventIds").forEach(id -> ids.add(id.asString()));
                var options = new ArrayList<JsonNode>();
                for (String id : ids) {
                    var event = events.get(id); if (event == null) continue;
                    if (category.equals("COMPREHENSION") && ATTRIBUTED.matcher(text).find()) {
                        var understood = event.value().path("userExperience").path("instructionUnderstood");
                        if (understood.isBoolean() && !understood.asBoolean()) options.add(proof(mapper,id,event.path()+"/userExperience/instructionUnderstood",understood));
                        var note = event.value().path("userExperience").path("feedbackNote");
                        if (note.isString() && !note.asString().isBlank() && text.contains(note.asString())) options.add(proof(mapper,id,event.path()+"/userExperience/feedbackNote",note));
                    }
                    if (category.equals("TECHNICAL_FAULT") && ATTRIBUTED.matcher(text).find()) {
                        var code = event.value().path("renderErrorCode");
                        if (code.isString() && !code.asString().isBlank() && !Set.of("NONE","NO_ERROR","UNKNOWN","UNDETERMINED").contains(code.asString())
                                && text.contains(code.asString())) options.add(proof(mapper,id,event.path()+"/renderErrorCode",code));
                    }
                    if (category.equals("REPORTED_DIFFICULTY") && ATTRIBUTED.matcher(text).find()) {
                        var note=event.value().path("userExperience").path("feedbackNote");
                        if(note.isString() && !note.asString().isBlank() && text.contains(note.asString()))
                            options.add(proof(mapper,id,event.path()+"/userExperience/feedbackNote",note));
                    }
                }
                result.add(new Claim(path,text,category,List.copyOf(ids),List.copyOf(options)));
            }
            findingIndex++;
        }
        return List.copyOf(result);
    }
    public static void validate(ObjectMapper mapper, JsonNode review, String candidate, JsonNode source, String actualModelReview) {
        var targets = claims(mapper,candidate,source); if (targets.isEmpty()) return;
        var events = events(source);
        for (var target : targets) {
            boolean relevant = "VALID".equals(review.path("verdict").asString());
            if ("REPAIR".equals(review.path("verdict").asString())) {
                var issue = review.path("issues").get(0);
                String reportedPath = issue == null ? "" : issue.path("path").asString();
                if(reportedPath.startsWith("/candidate/"))reportedPath=reportedPath.substring("/candidate".length());
                relevant = issue != null && "UNCONFIRMED_CAUSE".equals(issue.path("code").asString())
                        && target.path().equals(reportedPath) && !issue.path("quote").asString().isBlank()
                        && target.quote().contains(issue.path("quote").asString());
            }
            if (!relevant || !target.literalProofOptions().isEmpty()) continue;
            var originals = new ArrayList<JsonNode>();
            for (String id : target.evidenceEventIds()) {
                var event = events.get(id); if (event == null) continue;
                var row = mapper.createObjectNode().put("eventId",id).put("sourcePath",event.path());
                for (String field : List.of("eventCode","timeMs","userExperience","renderErrorCode","cart","cartItemCount","cartTotalAmount"))
                    if (event.value().has(field)) row.set(field,event.value().get(field).deepCopy());
                originals.add(row);
            }
            var proof = new FailureProof(VERSION,target.category(),target.evidenceEventIds(),List.copyOf(originals));
            throw AnalysisPlanSemanticReview.Rejected.sourceBound(actualModelReview,
                    new SourceBoundReviewChecks.Issue("UNSUPPORTED_ALTERNATIVE_SOURCE",target.path(),target.quote(),
                            "The unchanged cited records contain no direct attributed comprehension report or matching recorded render-error source for this alternative. Preserve the possible cause as unconfirmed; do not infer a deficit, negate the possibility, or invent evidence.",proof));
        }
        if (!"VALID".equals(review.path("verdict").asString())) return;
        var supplied = review.path("sourceBoundChecks").path("alternatives");
        if (!supplied.isArray() || supplied.size() != targets.size()) missing("/sourceBoundChecks/alternatives");
        var seen = new HashSet<String>();
        for (var check : supplied) {
            if (!check.isObject() || !check.propertyNames().equals(Set.of("path","quote","proofs"))) missing("/sourceBoundChecks/alternatives");
            var target = targets.stream().filter(row -> row.path().equals(check.path("path").asString()) && row.quote().equals(check.path("quote").asString())).findFirst().orElse(null);
            if (target == null || !seen.add(target.path()) || !check.path("proofs").isArray() || check.path("proofs").isEmpty()) missing("/sourceBoundChecks/alternatives");
            for (var proof : check.path("proofs")) if (target.literalProofOptions().stream().noneMatch(proof::equals)) missing(target.path());
        }
    }
    private static JsonNode proof(ObjectMapper mapper,String id,String path,JsonNode value) {
        var result=mapper.createObjectNode().put("eventId",id).put("sourcePath",path);result.set("sourceValue",value.deepCopy());return result;
    }
    private static Map<String,Event> events(JsonNode source) {
        var result=new LinkedHashMap<String,Event>();index(source.path(SourceEventDetails.FIELD),"/"+SourceEventDetails.FIELD,result);
        int position=0;for(var session:source.path(MovementSourceContext.FIELD).path("sessions"))index(session.path("movementEventDetails"),"/"+MovementSourceContext.FIELD+"/sessions/"+position++ +"/movementEventDetails",result);
        return result;
    }
    private static void index(JsonNode rows,String path,Map<String,Event> result) {
        int index=0;for(var row:rows){if(row.path("id").isString())result.put(row.path("id").asString(),new Event(path+"/"+index,row));index++;}
    }
    private static void missing(String path){throw new ReviewEvidenceException("REVIEW_SOURCE_BOUND_CHECK_REQUIRED",path,List.of());}
}
