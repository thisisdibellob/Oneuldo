package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Read-only claim locations and literal report-source checks, never a rewrite or a performance verdict. */
public final class CognitionReviewClaims {
    private static final Pattern COGNITION = Pattern.compile("(?:인지|이해|인식)(?:하|했|한|할|되|된|여부| 여부)|(?:인지|이해|인식)(?:가|는)? 확인");
    private static final Pattern AFFIRMED = Pattern.compile("(?:인지|이해|인식)(?:하고|했다|했습니다|했으|한 상태|한 뒤|하여|한 것으로|되었|됐)|(?:인지|이해|인식)(?:가|는)? 확인(?:되었|됐|됐다)");
    private static final Pattern QUALIFIED = Pattern.compile("미확인|불확실|불분명|확인되지|확인 불가|확인할 수 없|단정할 수 없|알 수 없|증거.{0,15}(?:없|부족)|여부|했는지|하는지|할 수 있는지");
    private static final Pattern REPORT_ATTRIBUTION = Pattern.compile("자기보고|보고했|보고하|응답했|응답하|말했|설문|기록");
    private CognitionReviewClaims() {}

    public static Map<String,String> locate(ObjectMapper mapper, String candidate) {
        var result = new LinkedHashMap<String,String>();
        var analysis = mapper.readTree(candidate).path("analysis");
        for (String field : List.of("summary","uncertainties")) collect(analysis.path(field),"/"+field,result);
        int index=0;
        for (var finding : analysis.path("findings")) {
            String path="/findings/"+index++;
            for (String field : List.of("observation","interpretation","alternativeExplanations","suggestedSupport"))
                collect(finding.path(field),path+"/"+field,result);
        }
        index=0;
        for (var assessment : analysis.path("sessionAssessments"))
            collect(assessment.path("explanation"),"/sessionAssessments/"+index+++"/explanation",result);
        collect(analysis.path("practicePlan").path("goal"),"/practicePlan/goal",result);
        collect(analysis.path("practicePlan").path("rationale").path("proposedPractice"),"/practicePlan/rationale/proposedPractice",result);
        return result;
    }
    private static void collect(JsonNode node, String path, Map<String,String> result) {
        if (node.isString()) {
            if (COGNITION.matcher(node.asString()).find()) result.put(path,node.asString());
        } else if (node.isArray()) {
            for(int i=0;i<node.size();i++) collect(node.get(i),path+"/"+i,result);
        } else if (node.isObject() && node.path("text").isString()) collect(node.path("text"),path+"/text",result);
    }

    public static void validate(ObjectMapper mapper, JsonNode review, String candidate, String source) {
        var claims=locate(mapper,candidate);
        if(claims.isEmpty() && !review.has("cognitionChecks")) return;
        if("REPAIR".equals(review.path("verdict").asString()) && !review.has("cognitionChecks")
                && review.path("issues").valueStream().noneMatch(issue->"UNCONFIRMED_COGNITION".equals(issue.path("code").asString()))) return;
        var checks=review.path("cognitionChecks");
        if(!checks.isArray()) fail("REVIEW_COGNITION_CHECK_REQUIRED",claims.isEmpty()?"/":claims.keySet().iterator().next());
        var seen=new HashSet<String>();
        for(var check:checks) {
            if(!check.isObject() || (!check.propertyNames().equals(Set.of("path","status","sourcePath"))
                    && !check.propertyNames().equals(Set.of("path","status","sourcePath","reportedValue")))
                    || !check.path("path").isString()) fail("REVIEW_COGNITION_CHECK_FORMAT","/cognitionChecks");
            String path=check.path("path").asString();
            if(!claims.containsKey(path)||!seen.add(path)) fail("REVIEW_COGNITION_CHECK_FORMAT","/cognitionChecks");
            String text=claims.get(path), status=check.path("status").asString();
            switch(status) {
                case "UNCERTAIN_OR_PROPOSED" -> {
                    if(check.has("reportedValue") || !check.path("sourcePath").isNull() || hasUnqualifiedAffirmation(text))
                        fail("REVIEW_UNCONFIRMED_COGNITION",path);
                }
                case "REPORTED_EXPERIENCE" -> {
                    if(!REPORT_ATTRIBUTION.matcher(text).find() || !check.path("sourcePath").isString()
                            || !check.has("reportedValue") || !literalReportMatches(mapper,source,check.path("sourcePath").asString(),check.path("reportedValue")))
                        fail("REVIEW_UNCONFIRMED_COGNITION",path);
                }
                case "UNSUPPORTED_ASSERTION" -> {
                    if(check.has("reportedValue") || !check.path("sourcePath").isNull() || !"REPAIR".equals(review.path("verdict").asString()))
                        fail("REVIEW_UNCONFIRMED_COGNITION",path);
                    boolean linked=false;
                    for(var issue:review.path("issues"))
                        linked|="UNCONFIRMED_COGNITION".equals(issue.path("code").asString()) && path.equals(issue.path("path").asString());
                    if(!linked) fail("REVIEW_COGNITION_CHECK_FORMAT",path);
                }
                default -> fail("REVIEW_COGNITION_CHECK_FORMAT",path);
            }
        }
        // A repair may identify one strongest issue. Approval must account for every located claim.
        if("VALID".equals(review.path("verdict").asString()) && !seen.equals(claims.keySet()))
            fail("REVIEW_COGNITION_CHECK_REQUIRED",claims.keySet().stream().filter(path->!seen.contains(path)).findFirst().orElse("/"));
    }
    private static boolean hasUnqualifiedAffirmation(String text) {
        for(String clause:text.split("[,，。.!?;\\n]|(?<=으나)|(?<=지만)"))
            if(AFFIRMED.matcher(clause).find() && !QUALIFIED.matcher(clause).find()) return true;
        return false;
    }
    private static boolean literalReportMatches(ObjectMapper mapper, String source, String path, JsonNode reported) {
        if(source==null || !path.matches("/(?:sourceEventDetails/[0-9]+|behaviorTimeline/sessions/[0-9]+/events/[0-9]+)/userExperience/(?:instructionUnderstood|feedbackNote|comfortReport)")) return false;
        var decoded=new FinalSourceEncoding(mapper).decode(mapper.readTree(source));
        if(decoded.path("behaviorTimeline").isObject()) decoded.set("behaviorTimeline",new CompactBehaviorTimeline(mapper).decodeExpanded(decoded.path("behaviorTimeline")));
        var value=decoded.at(path);
        return (value.isBoolean() || value.isString() && !value.asString().isBlank()) && value.equals(reported);
    }
    public static JsonNode literalReports(ObjectMapper mapper,ObjectNode source) {
        var reports=mapper.createArrayNode();
        int i=0;
        for(var event:source.path(SourceEventDetails.FIELD)) {
            reportFields(event,"/sourceEventDetails/"+i++,reports);
        }
        if(source.path("behaviorTimeline").isObject()) {
            var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(source.path("behaviorTimeline"));
            int session=0;
            for(var row:timeline.path("sessions")) {
                int event=0;
                for(var value:row.path("events")) reportFields(value,"/behaviorTimeline/sessions/"+session+"/events/"+event++,reports);
                session++;
            }
        }
        return reports;
    }
    private static void reportFields(JsonNode event,String path,tools.jackson.databind.node.ArrayNode reports) {
        for(String field:List.of("instructionUnderstood","feedbackNote","comfortReport")) {
            var value=event.path("userExperience").path(field);
            if(value.isBoolean() || value.isString() && !value.asString().isBlank())
                reports.addObject().put("sourcePath",path+"/userExperience/"+field).set("reportedValue",value.deepCopy());
        }
    }
    private static void fail(String code,String path) { throw new ReviewEvidenceException(code,path,List.of()); }
}
