package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Each model-authored claim owns its evidence once. Only formats/collects those same references. */
public final class ReviewedClaimOutput {
    public static final String FORMAT = "claim-evidence-v2";
    private static final Pattern INLINE_REFERENCE = Pattern.compile("(?<![A-Za-z0-9])E[0-9]+(?![A-Za-z0-9])");
    private static final Pattern REFERENCE_ANNOTATION = Pattern.compile(
            "[（(\\[]\\s*E[0-9]+(?:\\s*[,，;·]\\s*E[0-9]+)*\\s*[）)\\]]");
    private final ObjectMapper mapper;
    private final AnalysisReferences refs;

    private ReviewedClaimOutput(ObjectMapper mapper, AnalysisReferences refs) { this.mapper=mapper; this.refs=refs; }

    public static String read(ObjectMapper mapper, JsonNode envelope, AnalysisReferences refs) {
        return new ReviewedClaimOutput(mapper,refs).normalize(envelope).toString();
    }

    private ObjectNode normalize(JsonNode envelope) {
        keys(envelope,Set.of("reviewFormat","reviewNotes","analysis"),"/");
        if(!FORMAT.equals(envelope.path("reviewFormat").asString())) fail("INVALID_REVIEW_FORMAT","/reviewFormat",List.of());
        array(envelope.path("reviewNotes"),"/reviewNotes",0,20);
        for(var note:envelope.path("reviewNotes")) text(note,"/reviewNotes");
        var analysis=envelope.path("analysis");
        keys(analysis,Set.of("summary","findings","sessionAssessments","uncertainties","practicePlan","usedEvidenceCardIds"),"/analysis");
        var out=(ObjectNode)analysis.deepCopy();
        out.put("summary",sentences(analysis.path("summary"),"/summary",true,new LinkedHashSet<>()));
        array(analysis.path("findings"),"/findings",0,12);
        var findings=out.putArray("findings");
        int i=0;
        for(var finding:analysis.path("findings")) {
            String path="/findings/"+i++;
            keys(finding,Set.of("id","skill","observation","interpretation","alternativeExplanations","suggestedSupport"),path);
            var item=(ObjectNode)finding.deepCopy();
            var all=new LinkedHashSet<String>();
            String previousEvent=null;
            var clauses=new ArrayList<String>();
            array(finding.path("observation"),path+"/observation",1,30);
            int j=0;
            for(var value:finding.path("observation")) {
                String clausePath=path+"/observation/"+j++;
                var clause=claim(value,clausePath,true);
                // Each claim is strictly ordered, but the next claim may elaborate on
                // the same last event. Returning to an earlier event is still invalid.
                if(previousEvent!=null && Integer.parseInt(clause.ids().getFirst().substring(1))
                        < Integer.parseInt(previousEvent.substring(1))) {
                    var boundary=new ArrayList<String>();boundary.add(previousEvent);boundary.addAll(clause.ids());
                    fail("REVIEW_EVIDENCE_OUT_OF_ORDER",clausePath,boundary);
                }
                previousEvent=clause.ids().getLast();
                all.addAll(clause.ids());
                clauses.add("("+String.join(", ",clause.ids())+") "+clause.text());
            }
            item.put("observation",String.join(" ",clauses));
            item.put("interpretation",sentences(finding.path("interpretation"),path+"/interpretation",false,all));
            array(finding.path("alternativeExplanations"),path+"/alternativeExplanations",0,8);
            var alternatives=item.putArray("alternativeExplanations");
            j=0;
            for(var value:finding.path("alternativeExplanations")) {
                var alternative=claim(value,path+"/alternativeExplanations/"+j++,true);
                alternatives.add(alternative.text());all.addAll(alternative.ids());
            }
            var evidence=item.putArray("evidenceEventIds");
            all.stream().sorted(Comparator.comparingInt(id->Integer.parseInt(id.substring(1)))).forEach(evidence::add);
            findings.add(item);
        }
        array(analysis.path("sessionAssessments"),"/sessionAssessments",0,Integer.MAX_VALUE);
        var assessments=out.putArray("sessionAssessments");
        i=0;
        for(var value:analysis.path("sessionAssessments")) {
            String path="/sessionAssessments/"+i++;
            keys(value,Set.of("sessionId","judgment","explanation"),path);
            var evidence=new LinkedHashSet<String>();
            var explanation=sentences(value.path("explanation"),path+"/explanation",true,evidence);
            var item=(ObjectNode)value.deepCopy();item.put("explanation",explanation);
            item.set("evidenceEventIds",mapper.valueToTree(evidence.stream().sorted(Comparator.comparingInt(id->Integer.parseInt(id.substring(1)))).toList()));
            assessments.add(item);
        }
        return out;
    }

    private String sentences(JsonNode values,String path,boolean required,Set<String> evidence) {
        array(values,path,1,12);
        var text=new ArrayList<String>();
        int index=0;
        for(var value:values) {
            var claim=claim(value,path+"/"+index++,required);
            text.add(claim.text());evidence.addAll(claim.ids());
        }
        return String.join(" ",text);
    }

    private record Claim(String text,List<String> ids) {}

    private Claim claim(JsonNode value,String path,boolean required) {
        keys(value,Set.of("text","evidenceEventIds"),path);
        text(value.path("text"),path+"/text");
        array(value.path("evidenceEventIds"),path+"/evidenceEventIds",required?1:0,30);
        var ids=new ArrayList<String>();
        for(var id:value.path("evidenceEventIds")) {
            if(!id.isString() || !id.asString().matches("E[1-9][0-9]{0,8}"))
                fail("UNKNOWN_REVIEW_EVIDENCE",path,List.of());
            ids.add(id.asString());
        }
        if(new HashSet<>(ids).size()!=ids.size()) fail("DUPLICATE_REVIEW_EVIDENCE",path,ids);
        // A claim owns a set of citations. Normalize that set's display order only;
        // never move claims, drop a reference, rewrite prose, or choose new evidence.
        // Observation clauses still must follow the source chronology above.
        var unknown=ids.stream().filter(id->!refs.eventIds().contains(id)).toList();
        if(!unknown.isEmpty()) fail("UNKNOWN_REVIEW_EVIDENCE",path,unknown);
        ids.sort(Comparator.comparingInt(id->Integer.parseInt(id.substring(1))));
        order(ids,path);
        // Accept redundant annotations only when this very claim already owns every cited event.
        // Do not attach, infer or substitute evidence to make a claim pass.
        var annotations=REFERENCE_ANNOTATION.matcher(value.path("text").asString());
        StringBuilder cleaned=new StringBuilder();
        while(annotations.find()) {
            var references=INLINE_REFERENCE.matcher(annotations.group());
            while(references.find()) if(!ids.contains(references.group()))
                fail("INLINE_REVIEW_REFERENCE_NOT_ALLOWED",path,List.of(references.group()));
            annotations.appendReplacement(cleaned,"");
        }
        annotations.appendTail(cleaned);
        String prose=cleaned.toString().strip();
        var remaining=INLINE_REFERENCE.matcher(prose);
        if(remaining.find()) fail("INLINE_REVIEW_REFERENCE_NOT_ALLOWED",path,List.of(remaining.group()));
        if(prose.isBlank()) fail("INVALID_REVIEW_CLAIM_TEXT",path+"/text",List.of());
        return new Claim(prose,List.copyOf(ids));
    }

    private void order(List<String> ids,String path) {
        try { refs.validateEventOrder(ids); }
        catch(IllegalArgumentException invalid) {
            String code=invalid.getMessage().split(":",2)[0];
            var unknown=ids.stream().filter(id->!refs.eventIds().contains(id)).toList();
            fail(code,path,unknown.isEmpty()?ids:unknown);
        }
    }
    private void keys(JsonNode node,Set<String> keys,String path) {
        if(!node.isObject() || !keys.equals(node.propertyNames())) fail("INVALID_REVIEW_CLAIM_SHAPE",path,List.of());
    }
    private void array(JsonNode node,String path,int min,int max) {
        if(!node.isArray() || node.size()<min || node.size()>max) fail("INVALID_REVIEW_CLAIM_ARRAY",path,List.of());
    }
    private void text(JsonNode node,String path) {
        if(!node.isString() || node.asString().isBlank() || node.asString().length()>2000)
            fail("INVALID_REVIEW_CLAIM_TEXT",path,List.of());
    }
    private void fail(String code,String path,List<String> ids) { throw new ReviewEvidenceException(code,path,ids); }
}
