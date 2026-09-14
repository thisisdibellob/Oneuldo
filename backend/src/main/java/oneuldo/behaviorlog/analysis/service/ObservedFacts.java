package oneuldo.behaviorlog.analysis.service;

import java.math.BigDecimal;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Deterministic facts from the immutable play; never infers intent or action duration. */
public final class ObservedFacts {
    private final ObjectMapper mapper;
    public ObservedFacts(ObjectMapper mapper) { this.mapper = mapper; }
    public ObjectNode build(BehaviorAnalysisInputResponse chunk, BehaviorAnalysisInputResponse full) {
        var root=mapper.createObjectNode();
        root.put("rule", "intervals=[앞사건,뒤사건,차이ms,차이초]. 사건 시각 차이이며 정지/인지/행동 지속시간의 증거는 아니다. products=[상품ID,선반코드]. 원본 값만 사용한다.");
        var sessions=root.putArray("sessions");
        for(var session:chunk.input().sessions()) {
            var row=sessions.addObject();row.put("sessionId",session.sessionId().toString());
            var intervals=row.putArray("intervals");
            oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.EventTimeline previous=null;
            for(var event:session.events()) {
                if(event.action()==null || event.action().eventCode()==null || Set.of("SHOP.MOVEMENT_SAMPLED", "SHOP.MOVEMENT_SEGMENT_SUMMARIZED").contains(event.action().eventCode())) continue;
                if(previous!=null
                        && previous.elapsedFromSessionStartMs()>=0 && event.elapsedFromSessionStartMs()>=previous.elapsedFromSessionStartMs()) {
                    long delta=event.elapsedFromSessionStartMs()-previous.elapsedFromSessionStartMs();
                    intervals.addArray().add(previous.behaviorLogId().toString()).add(event.behaviorLogId().toString())
                            .add(delta).add(BigDecimal.valueOf(delta,3));
                }
                previous=event;
            }
            // Retain separate scene sources; never substitute today's catalog or another session's products.
            var scenes=row.putArray("scenes");
            for(var original:full.input().sessions()) if(original.sessionId().equals(session.sessionId())) {
                for(var e:original.events()) {
                    JsonNode scene=mapper.valueToTree(e.payload()).path("marketContent").path("sceneSnapshot");
                    if(!scene.isObject()) continue;
                    Set<String> wanted=new HashSet<>();
                    for(var goal:scene.path("mission").path("objectives")) if(goal.path("productId").isString()) wanted.add(goal.path("productId").asString());
                    if(wanted.isEmpty()) continue;
                    var source=scenes.addObject();source.put("sourceEventId",e.behaviorLogId().toString());
                    var products=source.putArray("products");
                    for(var product:scene.path("products")) if(wanted.contains(product.path("id").asString()) && product.path("categoryId").isString())
                        products.addArray().add(product.path("id").asString()).add(product.path("categoryId").asString());
                }
            }
        }
        return root;
    }
}
