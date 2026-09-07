package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;

/** Synthesizes observations whose source IDs have been checked, without replaying raw scene blobs. */
public final class AnalysisSynthesisPrompt {
    public static final String VERSION="synthesis-v2-broader";
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
        root.put("stage","FINAL: 원본은 앞선 관측 단계에서 읽었고 여기에는 AI 해석과 참조 검증을 통과한 사건 ID를 제공한다. 참조 검증이 해석의 진실성을 보장하지 않는다. 원문을 다시 읽었다고 주장하지 말 것. 요약의 상충/도움/반증/불확실성을 유지하고 근거 부족시 판단 보류. 사건 이름이나 다수결로 성패를 정하지 않는다.");
        root.set("taskContext",prompts.tasks(input));
        root.set("chunkAnalyses",mapper.valueToTree(digests));
        root.put("movementDetailLimited",limited);
        root.put("practiceCapabilities","장보기 품목2~4개/수량/예산/문자 지원 조정만 가능. 품절·예약·음성·실제 결제 지시 불가.");
        var evidence=new HashSet<UUID>();digests.forEach(d->d.observations().forEach(o->evidence.addAll(o.evidenceEventIds())));
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
