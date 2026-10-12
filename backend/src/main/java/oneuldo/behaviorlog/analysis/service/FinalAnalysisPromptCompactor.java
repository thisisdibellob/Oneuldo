package oneuldo.behaviorlog.analysis.service;

import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Final-stage transport changes only; never edits stored observations or chooses evidence. */
public final class FinalAnalysisPromptCompactor {
    public static final String VERSION = "final-input-v8-support-boundaries";
    private final ObjectMapper mapper;
    public FinalAnalysisPromptCompactor(ObjectMapper mapper) { this.mapper = mapper; }

    public static String systemPrompt() {
        return AnalysisSourceContext.FINAL_RULES + "\n" + AdaptiveObservationGuidance.RULE;
    }

    public ObjectNode compactInstructions(ObjectNode source) {
        ObjectNode root = source.deepCopy();
        root.put("finalInputVersion", VERSION);
        var cards = mapper.createArrayNode();
        for (var card : root.path("evidenceCards")) {
            var brief = mapper.createObjectNode();
            // Keep provenance and all interpretation/scope caveats. Full rights/review records stay in EvidenceIndex.
            for (String field : List.of("card_id", "title", "source_url", "organization", "year",
                    "population", "claim_ko", "claim_kind", "locator", "caution_ko", "source_limitations_ko",
                    "read_scope", "expert_validated", "allowed_use", "fine_tuning_training_approved", "modification_notice"))
                if (card.has(field)) brief.set(field, card.get(field));
            cards.add(brief);
        }
        if (cards.size()>1) {
            var defaults=mapper.createObjectNode();
            for(String field:new java.util.TreeSet<>(((ObjectNode)cards.get(0)).propertyNames())) {
                JsonNode value=cards.get(0).get(field);
                if(!field.equals("card_id") && java.util.stream.StreamSupport.stream(cards.spliterator(),false).allMatch(c -> value.equals(c.get(field)))) defaults.set(field,value);
            }
            cards.forEach(c -> ((ObjectNode)c).remove(defaults.propertyNames()));
            root.set("evidenceCardDefaults",defaults);
            root.put("evidenceCardEncoding","각 evidenceCard는 evidenceCardDefaults의 공통 속성과 합쳐 읽는다. 전체 관리 기록은 서버의 카드 ID로 보존한다.");
        }
        root.set("evidenceCards", cards);
        root.put("outputContract", """
                JSON 필드 정의(모두 필수, 설명은 문자열):
                summary; usedEvidenceCardIds:[사용한 카드 ID];
                findings:[{id,skill,observation,interpretation,alternativeExplanations:[],evidenceEventIds:[사건 ID],suggestedSupport}];
                sessionAssessments:[{sessionId,judgment:SUCCESS|FAILURE|UNDETERMINED,explanation,evidenceEventIds:[해당 세션 사건 ID]}];
                uncertainties:[자료 한계];
                practicePlan:{targetFindingIds:[finding ID],goal,rationale,recommendedDifficulty:정수1~3,itemCount:정수1~4,quantityComplexity:LOW|MEDIUM|HIGH,budgetPressure:LOW|MEDIUM|HIGH,textSupport:SIMPLIFIED|STANDARD|REDUCED,reasonCodes:[영문대문자/숫자/밑줄 2~50자,1~8개]}.
                각 finding에 실제 근거를 넣는다. 대안 설명은 원본 근거가 있는 경우에만 쓴다. 없으면 alternativeExplanations는 []이며, 동기·이해도 미확인은 uncertainties에 쓴다. 대안의 개수를 채우지 않는다. findings 최대12개, 핵심1개 권장. 모든 세션을 한 번씩 판정하고 실제 근거를 1개 이상 인용한다.
                targetFindingIds는 반환한 finding을 참조한다. finding이 없으면 빈 배열과 불확실성을 쓰고 rationale에 관찰용 연습임을 명시한다.
                난이도 범위는 게임 실행 제약이다. summary와 각 설명은 필요한 규격·수량·근거 관계를 설명하되 중복하지 않는다. 고정 글자 수 때문에 사실을 빼지 않는다. 대안은 근거가 없으면 빈 배열이다. 불확실성은 필요한 만큼 유지한다. 핵심 근거·한계가 더 필요하면 유지하되 장문 배경설명과 본문의 ID 반복은 피한다.
                """);
        return root;
    }

    public String compact(ObjectNode source) {
        ObjectNode root = compactInstructions(source);
        String original = pack(root);
        ObjectNode expanded = root.deepCopy();
        expanded.set("behaviorTimeline", new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline")));
        String table = pack(expanded);
        // Same events/values/order; expanding the mixed movement/object rows permits common values to be stored once.
        String best = QwenTokenCounter.count(table) < QwenTokenCounter.count(original) ? table : original;
        expanded.set("behaviorTimeline", new LosslessEventColumns(mapper).encode((ObjectNode)expanded.path("behaviorTimeline")));
        String columns = pack(expanded);
        return QwenTokenCounter.count(columns) < QwenTokenCounter.count(best) ? columns : best;
    }
    private String pack(JsonNode root) { return mapper.writeValueAsString(new LosslessTables(mapper).encode(root)); }
}
