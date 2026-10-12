package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;

/** Synthesizes observations whose source IDs have been checked, without replaying raw scene blobs. */
public final class AnalysisSynthesisPrompt {
    public static final String FINAL_STAGE="FINAL: compare original events with chunk observations. Originals take priority; no unrecorded actions. IDs alone prove no claim.";
    public static final String VERSION="synthesis-v16-single-policy-copy";
    public static final String CONTRACT="""
        짧은 JSON 객체: {"s":"요약","f":[["F1","기술","사실","가설",[],["E1"],"지원"]],
        "a":[["S1","SUCCESS|FAILURE|UNDETERMINED","이유",["E1"]]],"u":["한계"],
        "p":[["F1"],"목표","근거와 목표 연결",1,2,"LOW","LOW","SIMPLIFIED",["OBSERVATION_PRACTICE"]],"c":[]}
        f의 각 행은 정확히7칸이며 순서는 [id,skill,observation,interpretation,alternativeExplanations,evidenceEventIds,suggestedSupport]다.
        skill은 '상품 규격 선택' 같은 관찰 영역 이름인 문자열이며 observation 문장과 별도 칸이다. skill을 생략하거나 사실 설명을 두 칸으로 나누지 않는다.
        0=id문자열,1=skill문자열,2=관찰문자열,3=해석문자열,4=대안문자열배열(없으면[]),5=근거ID배열,6=지원문자열이다. 모든 행에 빈 대안 배열도 반드시 넣는다.
        f는 서로 다른 근거가 있으면 2~3개 작성하며 근거가 적으면 적게 쓴다. 구간에서 관찰되지 않은 행동으로 개수를 채우지 않는다. a는 모든 제공 세션을 한번씩 포함. 모든 근거는 evidenceReferences의 해당 세션 ID만.
        p의 순서: findingID목록,목표,이유,난이도1~3,품목1~4,수량복잡도LOW|MEDIUM|HIGH,예산압박LOW|MEDIUM|HIGH,문자지원SIMPLIFIED|STANDARD|REDUCED,영문대문자사유목록.
        사실은 무엇을 어떻게 했는지, 가설은 그렇게 해석한 이유, 지원은 다음에 할 수 있는 행동을 각각 완결된 문장으로 설명한다. 고정 글자 수로 자르지 말고 중복 표현을 줄여 출력 상한 안에서 JSON을 완성한다. 대안 설명은 원본 근거가 있는 경우에만 쓴다. 없으면 alternativeExplanations는 []이며, 동기·이해도 미확인은 uncertainties에 쓴다. 대안의 개수를 채우지 않는다. f가 비면 p첫칸도 빈배열, 관찰용 과제임을 명시.
        c는 빈배열: 이 요청에 문헌 카드를 제공하지 않았다. 관찰 밖 추론은 확정하지 않는다.
        """;
    public static String build(ObjectMapper mapper,AiBehaviorAnalysisPromptFactory prompts,BehaviorAnalysisInputResponse input,
            List<AiObservationDigest> digests,AnalysisReferences refs,boolean limited) {
        return build(mapper,prompts,input,digests,refs,limited,List.of());
    }
    public static String build(ObjectMapper mapper,AiBehaviorAnalysisPromptFactory prompts,BehaviorAnalysisInputResponse input,
            List<AiObservationDigest> digests,AnalysisReferences refs,boolean limited,List<BehaviorAnalysisInputResponse> scopes) {
        var root=mapper.createObjectNode();root.put("synthesisVersion",VERSION);
        root.put("stage",FINAL_STAGE);
        var details=SourceEventDetails.build(mapper,input);
        root.set(SourceEventDetails.FIELD,details);
        var movementContext=MovementSourceContext.build(mapper,input);
        root.set(MovementSourceContext.FIELD,movementContext);
        root.put("categoryMeaning","produce=과일/채소, fresh=냉장 식품, drink=음료, meal=간편 식품. 원래 categoryId로 위치를 확인한다.");
        root.set("sourceCoverage",AnalysisSourceContext.coverage(mapper,input));
        var scopeNodes=root.putArray("chunkScopes");
        for(int i=0;i<scopes.size();i++) {
            var scope=AnalysisSourceContext.coverage(mapper,scopes.get(i));
            scope.put("chunkAnalysisIndex",i);scope.put("fullEventCount",input.eventCount());
            scope.put("partial",scopes.get(i).eventCount()<input.eventCount());scopeNodes.add(scope);
        }
        // FinalAnalysisPromptCompactor.systemPrompt() already supplies the complete review guidance.
        // Keep the immutable source values here without repeating the same instruction block.
        root.set("taskContext",prompts.tasks(input));
        root.set("catalogProductCategories",ProductLocationSource.build(mapper,new AnalysisContentScope(mapper).catalog(input)));
        root.set("chunkAnalyses",mapper.valueToTree(digests));
        root.put("movementDetailLimited",limited);
        var evidence=new HashSet<UUID>();digests.forEach(d->d.observations().forEach(o->evidence.addAll(o.evidenceEventIds())));
        details.forEach(e->evidence.add(UUID.fromString(e.path("id").asString())));
        for(var session:movementContext.path("sessions")) {
            for(var event:session.path("movementEventDetails")) evidence.add(UUID.fromString(event.path("id").asString()));
            for(String field:List.of("sceneSources","collectorContexts"))
                for(var source:session.path(field)) evidence.add(UUID.fromString(source.path("sourceEventId").asString()));
        }
        var citations=root.putArray("evidenceReferences");
        var coverage=root.putArray("coverage");
        for(var session:input.input().sessions()) {
            var c=coverage.addObject();c.put("sessionId",session.sessionId().toString());c.put("eventCount",session.events().size());
            // The raw start anchor allows an explicitly undetermined assessment even with no finding.
            if(!session.events().isEmpty()) evidence.add(session.events().getFirst().behaviorLogId());
            for(var event:session.events()) if(evidence.contains(event.behaviorLogId())) {
                var r=citations.addObject();r.put("id",event.behaviorLogId().toString());r.put("sessionId",session.sessionId().toString());
                r.put("timeMs",event.elapsedFromSessionStartMs());if(event.action()!=null)r.put("eventCode",event.action().eventCode());
            }
        }
        root.put("outputContract",COMPACT_CONTRACT);
        AnalysisSourceContext.addMissionPlanProvenance(mapper,root);
        String source = refs.encode(prompts.pack(root));
        var decoded = (tools.jackson.databind.node.ObjectNode) new LosslessTables(mapper).decode(mapper.readTree(source));
        return mapper.writeValueAsString(new FinalSourceEncoding(mapper).encodeReadable(decoded));
    }
    public static final String COMPACT_CONTRACT="Korean JSON example (replace placeholders with source facts): {\"s\":\"요약\",\"f\":[[\"F1\",\"기술 영역\",\"관찰\",\"해석\",[],[\"E1\"],\"지원 제안\"]],\"a\":[[\"S1\",\"UNDETERMINED\",\"근거와 한계\",[\"E1\"]]],\"u\":[\"한계\"],\"p\":[[\"F1\"],\"목표\",\"관찰과 연습 연결\",1,2,\"LOW\",\"LOW\",\"SIMPLIFIED\",[\"OBSERVATION_PRACTICE\"]],\"c\":[]}. f rows exactly7 columns [id,skill,observation,interpretation,alternativeExplanations,evidenceEventIds,suggestedSupport], including alternatives[]. skill is separate from observation. a rows exactly4 columns, every session once, SUCCESS|FAILURE|UNDETERMINED by originals. p is ONE9-column array:0 findingIds array,1 goal,2 rationale,3 difficulty1..3,4 itemCount1..4,5 quantityComplexity LOW|MEDIUM|HIGH,6 budgetPressure LOW|MEDIUM|HIGH,7 textSupport SIMPLIFIED|STANDARD|REDUCED,8 uppercase reasonCodes array. Never put GUIDED_PRACTICE/SUPPORT_FADING/INDEPENDENT_PROBE in p[7]; those are purposes, not textSupport values. Use1..3 supported findings without quotas; cite only supplied session IDs in original order. Complete concise source-grounded clauses; grounded alternatives or[], unknown causes/comprehension and counterevidence remain explicit. If no findings use[] and observation-only rationale. c=[]: no literature cards supplied.";
}
