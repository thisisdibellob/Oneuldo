package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;

/** Recorded collector meaning and unmeasured route scope only; never rewrites an AI judgment. */
public final class AnalysisLanguageChecks {
    private static final Pattern EFFICIENCY=Pattern.compile("비효율적(?:인|이었다|이다)?|효율성이\\s*(?:낮|높)|최적(?:의)?\\s*(?:동선|경로)");
    private static final Pattern QUALIFIED=Pattern.compile("미측정|측정하지|확인할 수 없|단정할 수 없|미확인|불확실|알 수 없|평가할|관찰할|계획|제안|가능성|인지 여부|인지 알");
    private AnalysisLanguageChecks() {}
    public static void validate(ObjectMapper mapper,String candidate,String actualReview) {
        var root=mapper.readTree(candidate).path("analysis");var strings=new LinkedHashMap<String,String>();collect(root,"",strings);
        for(var entry:strings.entrySet()) {
            String path=entry.getKey(),text=entry.getValue();
            if(path.startsWith("/uncertainties/")&&text.contains("ITEM_SEARCH_STARTED")&&text.contains("검색창")
                    &&(text.contains("인지")||text.contains("구분")||text.contains("일 수"))&&!text.contains("자동 이동 신호")&&!text.contains("검색창 사용을 증명하지"))
                reject(actualReview,"COLLECTOR_MEANING_MISMATCH",path,text,"The recorded collector defines ITEM_SEARCH_STARTED as an automatic movement/restart signal. Its definition is known; hidden cognition remains unknown.",Map.of("eventCode","SHOP.ITEM_SEARCH_STARTED","collectorMeaning","automatic movement/restart"));
            boolean claim=path.endsWith("/text")&&(path.startsWith("/summary/")||path.contains("/observation/")||path.contains("/interpretation/")||path.contains("/explanation/"));
            boolean published=path.equals("/summary")||path.endsWith("/observation")||path.endsWith("/interpretation")||path.endsWith("/explanation");
            if(!claim&&!published)continue;
            var match=EFFICIENCY.matcher(text);
            if(match.find()&&!QUALIFIED.matcher(text).find())
                reject(actualReview,"UNMEASURED_ROUTE_EFFICIENCY",path,match.group(),"Current recorded coordinates/proximity/straight distance do not measure feasible-route efficiency. Preserve recorded transitions; do not assign an efficient/inefficient route verdict.",Map.of("scope","collector provides no feasible shortest-route comparator"));
        }
    }
    private static void collect(JsonNode node,String path,Map<String,String> out) {
        if(node.isString()){out.put(path,node.asString());return;}
        if(node.isObject())for(String k:node.propertyNames())collect(node.get(k),path+"/"+k.replace("~","~0").replace("/","~1"),out);
        else if(node.isArray())for(int i=0;i<node.size();i++)collect(node.get(i),path+"/"+i,out);
    }
    private static void reject(String actual,String code,String path,String quote,String explanation,Object proof) {
        throw AnalysisPlanSemanticReview.Rejected.sourceBound(actual,new SourceBoundReviewChecks.Issue(code,path,quote,explanation,proof));
    }
}
