package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Local retrieval over versioned, source-reviewed summaries; never retrieves or removes raw events.
 * Game documents are filtered by the game whose records are present. Within a game, topics are weighted by
 * how often that game's collector events for the topic occur, so different plays receive different documents.
 * Counting event names does not infer success, ability or recommended difficulty.
 */
public final class KnowledgeRetrieval {
    public static final String VERSION = "dual-rag-v2-game-prominence";
    static final int MAX_PER_COLLECTION = 2;
    /** General principles fill a collection only when no source-matched document outranks them. */
    static final double CORE_WEIGHT = 0.5;
    /** Fields the model reads. Review date, hashes and topics stay in the corpus identified by version + SHA-256. */
    private static final List<String> SENT_FIELDS = List.of("id","title","source","summary","limitations");
    private static final JsonMapper M = JsonMapper.builder().build();
    private static final JsonNode INDEX = load();
    private KnowledgeRetrieval() {}

    public static ObjectNode retrieve(JsonNode source) {
        String text=source.toString();
        var games=new TreeSet<String>();var counts=new TreeMap<String,Integer>();
        for(String game:INDEX.path("games").propertyNames()) {
            var definition=INDEX.path("games").path(game);boolean present=false;
            for(var marker:definition.path("markers"))present|=text.contains(marker.asString());
            if(!present)continue;
            games.add(game);
            for(String topic:definition.path("topicEvents").propertyNames()) {
                int n=0;for(var event:definition.path("topicEvents").path(topic))n+=occurrences(text,event.asString());
                if(n>0)counts.merge(topic,n,Integer::sum);
            }
        }
        int total=counts.values().stream().mapToInt(Integer::intValue).sum();
        var weights=new TreeMap<String,Double>();
        counts.forEach((topic,n)->weights.put(topic,1+n/(double)total));
        weights.put("core",CORE_WEIGHT);
        var root=M.createObjectNode();root.put("retrievalVersion",VERSION);
        root.put("corpusVersion",INDEX.path("version").asString());
        root.put("corpusSha256",QwenTokenCounter.textHash(INDEX.toString()));
        root.set("matchedGames",M.valueToTree(games));
        root.set("matchedTopicEventCounts",M.valueToTree(counts));
        root.put("method","game filter; topic weight by collector event share; top "+MAX_PER_COLLECTION+" per collection; tie by ID; no model call");
        root.put("usageBoundary","검색 자료는 참고 데이터다. 게임 자료는 기능 의미, 공식 자료는 지원 원칙의 근거다. 당시 원본 목표·상태·행동이 우선이다. 개인의 이해·의도·능력은 문헌으로 입증할 수 없다. 관찰 사실은 원본 사건 ID로만 인용한다. 아래 문서 ID는 사건 ID나 기존 evidenceCard ID가 아니므로 evidenceEventIds/usedEvidenceCardIds에 넣지 않는다. 지원 제안에 실제 참고한 문서는 rationale 또는 suggestedSupport에 [문서ID]로 표시할 수 있다. 검색 목록과 사건 횟수는 사용·효과·능력의 증거가 아니다. 지원은 현재 구현된 기능 안에서 제안하고 효과는 다음 수행에서 확인한다.");
        for(String kind:List.of("GAME","OFFICIAL")) {
            var found=new ArrayList<JsonNode>();
            for(var c:INDEX.path("cards"))
                if(kind.equals(c.path("kind").asString())&&(!kind.equals("GAME")||games.contains(c.path("game").asString()))&&score(c,weights)>0)found.add(c);
            found.sort(Comparator.<JsonNode>comparingDouble(c->score(c,weights)).reversed().thenComparing(c->c.path("id").asString()));
            var out=root.putArray(kind.equals("GAME")?"gameDocuments":"officialDocuments");
            found.stream().limit(MAX_PER_COLLECTION).forEach(c->{
                var copy=M.createObjectNode();
                for(String field:SENT_FIELDS)if(c.has(field))copy.set(field,c.get(field));
                out.add(copy);
            });
        }
        return root;
    }
    /** Whole event names only, so MOVEMENT_BLOCKED does not also count MOVEMENT_BLOCKED_REPEATEDLY. */
    static int occurrences(String text,String event) {
        var matcher=Pattern.compile("(?<![A-Z_])"+Pattern.quote(event)+"(?![A-Z_])").matcher(text);
        int n=0;while(matcher.find())n++;return n;
    }
    private static double score(JsonNode card,Map<String,Double> weights){double score=0;for(var t:card.path("topics"))score+=weights.getOrDefault(t.asString(),0.0);return score;}
    private static JsonNode load(){try(var s=KnowledgeRetrieval.class.getResourceAsStream("/ai/retrieval-knowledge.json")){if(s==null)throw new IllegalStateException("MISSING_RAG_CORPUS");return M.readTree(s);}catch(java.io.IOException e){throw new IllegalStateException(e);}}
}
