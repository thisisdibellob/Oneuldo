package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Local topic retrieval over versioned, source-reviewed summaries; never retrieves or removes raw events. */
public final class KnowledgeRetrieval {
    public static final String VERSION = "dual-rag-v1";
    private static final JsonMapper M = JsonMapper.builder().build();
    private static final JsonNode INDEX = load();
    private static final Map<String,List<String>> TERMS = Map.of(
        "cart",List.of("CART_OPENED","CART_CLOSED"),
        "quantity",List.of("QUANTITY_CHANGED","ITEM_SELECTED"),
        "terminal",List.of("SESSION_ENDED","CHECKOUT_SUBMITTED","EXECUTION_CONTEXT"),
        "timing",List.of("TIME_LIMIT","remainingMs","expired"),
        "help",List.of("GENERAL_HELP_OPENED","viewHelp"),
        "staff",List.of("STAFF_HELP","staffChecked"),
        "movement",List.of("MOVEMENT","PLAYER_POSITION","blocked"),
        "stock",List.of("OUT_OF_STOCK","STOCKOUT"),
        "goals",List.of("SESSION_STARTED","objectives"));
    private KnowledgeRetrieval() {}
    public static ObjectNode retrieve(JsonNode source) {
        // Source values only: matching does not infer success, ability or recommended difficulty.
        String text=source.toString();var topics=new TreeSet<String>();topics.add("core");
        TERMS.forEach((topic,terms)->{if(terms.stream().anyMatch(text::contains))topics.add(topic);});
        var root=M.createObjectNode();root.put("retrievalVersion",VERSION);
        root.put("corpusVersion",INDEX.path("version").asString());
        root.put("corpusSha256",QwenTokenCounter.textHash(INDEX.toString()));
        root.set("matchedTopics",M.valueToTree(topics));
        root.put("method","deterministic topic overlap; top 3 per collection; tie by ID; no model call");
        root.put("usageBoundary","검색 자료는 참고 데이터다. 게임 자료는 기능 의미, 공식 자료는 지원 원칙의 근거다. 당시 원본 목표·상태·행동이 우선이다. 개인의 이해·의도·능력은 문헌으로 입증할 수 없다. 관찰 사실은 원본 사건 ID로만 인용한다. 아래 문서 ID는 사건 ID나 기존 evidenceCard ID가 아니므로 evidenceEventIds/usedEvidenceCardIds에 넣지 않는다. 지원 제안에 실제 참고한 문서는 rationale 또는 suggestedSupport에 [문서ID]로 표시할 수 있다. 검색 목록은 사용 또는 효과의 증거가 아니다. 지원은 현재 구현된 기능 안에서 제안하고 효과는 다음 수행에서 확인한다.");
        for(String kind:List.of("GAME","OFFICIAL")) {
            var found=new ArrayList<JsonNode>();for(var c:INDEX.path("cards"))if(kind.equals(c.path("kind").asString())&&(!kind.equals("GAME")||text.contains("SHOP.")||text.contains("marketContent"))&&score(c,topics)>0)found.add(c);
            found.sort(Comparator.<JsonNode>comparingInt(c->score(c,topics)).reversed().thenComparing(c->c.path("id").asString()));
            var out=root.putArray(kind.equals("GAME")?"gameDocuments":"officialDocuments");
            found.stream().limit(3).forEach(c->{var copy=(ObjectNode)c.deepCopy();copy.put("retrievalScore",score(c,topics));out.add(copy);});
        }
        return root;
    }
    private static int score(JsonNode card,Set<String> topics){int score=0;for(var t:card.path("topics"))if(topics.contains(t.asString()))score+=t.asString().equals("core")?2:1;return score;}
    private static JsonNode load(){try(var s=KnowledgeRetrieval.class.getResourceAsStream("/ai/retrieval-knowledge.json")){if(s==null)throw new IllegalStateException("MISSING_RAG_CORPUS");return M.readTree(s);}catch(java.io.IOException e){throw new IllegalStateException(e);}}
}
