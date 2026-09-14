package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;

/** Synthesizes observations whose source IDs have been checked, without replaying raw scene blobs. */
public final class AnalysisSynthesisPrompt {
    public static final String VERSION="synthesis-v4-source-crosscheck";
    public static final String CONTRACT="""
        짧은 JSON 객체: {"s":"요약","f":[["F1","기술","사실","가설",["다른설명"],["E1"],"지원"]],
        "a":[["S1","SUCCESS|FAILURE|UNDETERMINED","이유",["E1"]]],"u":["한계"],
        "p":[["F1"],"목표","근거와 목표 연결",1,2,"LOW","LOW","SIMPLIFIED",["OBSERVATION_PRACTICE"]],"c":[]}
        f는 서로 다른 근거가 있으면 2~3개 작성하며 근거가 적으면 적게 쓴다. 구간에서 관찰되지 않은 행동으로 개수를 채우지 않는다. a는 모든 제공 세션을 한번씩 포함. 모든 근거는 evidenceReferences의 해당 세션 ID만.
        p의 순서: findingID목록,목표,이유,난이도1~3,품목2~4,수량복잡도LOW|MEDIUM|HIGH,예산압박LOW|MEDIUM|HIGH,문자지원SIMPLIFIED|STANDARD|REDUCED,영문대문자사유목록.
        사실은 무엇을 어떻게 했는지, 가설은 그렇게 해석한 이유, 지원은 다음에 할 수 있는 행동을 각각 완결된 문장으로 설명한다. 고정 글자 수로 자르지 말고 중복 표현을 줄여 출력 상한 안에서 JSON을 완성한다. 다른 설명과 자료 한계 필수. f가 비면 p첫칸도 빈배열, 관찰용 과제임을 명시.
        c는 빈배열: 이 요청에 문헌 카드를 제공하지 않았다. 관찰 밖 추론은 확정하지 않는다.
        """;
    public static String build(ObjectMapper mapper,AiBehaviorAnalysisPromptFactory prompts,BehaviorAnalysisInputResponse input,
            List<AiObservationDigest> digests,AnalysisReferences refs,boolean limited) {
        var root=mapper.createObjectNode();root.put("synthesisVersion",VERSION);
        root.put("stage","FINAL: AI 구간 해석과 원본 사건 값 사본을 함께 제공한다. 참조 ID 검증은 해석의 진실성을 보장하지 않는다. "
                + "먼저 sourceEventDetails에서 실제 상품·수량·장바구니를 읽고 각 구간 요약과 대조한 뒤 최종 판단하라. "
                + "기록 존재 여부나 값이 상충하면 원본을 우선하고 잘못된 구간 해석을 사실로 계승하지 말라. "
                + "사본에 없는 이동 세부를 다시 읽었다고 주장하지 말 것. 사건 이름이나 다수결로 성패를 정하지 않는다.");
        var details=SourceEventDetails.build(mapper,input);
        root.set(SourceEventDetails.FIELD,details);
        root.put("sourceEventDetailsRule",SourceEventDetails.RULE);
        root.put("eventSemantics",prompts.marketEventSemantics());
        root.put("interpretationRule","대안 설명의 개수를 채우려고 자동 결제·자동 팝업·시스템 수량 변경 등 입력에 없는 기능을 가정하지 않는다. "
                + "기록으로 지지되는 대안이 없으면 '이 기록만으로 행동의 동기는 확인할 수 없다'처럼 확인 한계를 명시한다. "
                + "skill에는 기술 이름을, observation에는 실제 행동을 쓴다. 지원은 다음 플레이에서 할 수 있는 구체적인 행동으로 제안한다.");
        root.set("taskContext",prompts.tasks(input));
        root.set("chunkAnalyses",mapper.valueToTree(digests));
        root.put("movementDetailLimited",limited);
        root.put("practiceCapabilities","장보기 품목2~4개/수량/예산/문자 지원 조정만 가능. 품절·예약·음성·실제 결제 지시 불가.");
        var evidence=new HashSet<UUID>();digests.forEach(d->d.observations().forEach(o->evidence.addAll(o.evidenceEventIds())));
        details.forEach(e->evidence.add(UUID.fromString(e.path("id").asString())));
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
        root.put("outputContract",CONTRACT);
        return refs.encode(prompts.pack(root));
    }
}
