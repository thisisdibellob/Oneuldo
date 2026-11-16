package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;

/** Observation facts remain; transport bookkeeping and unrelated catalog entries stay in the snapshot. */
public final class ObservationInputCompactor {
    public static final String VERSION="observation-input-v3-derivable-columns";
    private final ObjectMapper mapper;
    public ObservationInputCompactor(ObjectMapper mapper) {this.mapper=mapper;}
    public ObjectNode compact(ObjectNode root,BehaviorAnalysisInputResponse full) {
        var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
        Set<String> products=new HashSet<>();
        collect(root.path("taskContext"),products);
        for(var session:timeline.path("sessions")) for(var event:session.path("events")) collect(event.path("payload"),products);
        var context=mapper.createArrayNode();
        for(var session:mapper.valueToTree(full.input()).path("sessions")) {
            var entries=mapper.createArrayNode();
            for(var event:session.path("events")) {
                var scene=event.path("payload").path("marketContent").path("sceneSnapshot");
                if(!scene.isObject()) continue;
                var selected=mapper.createArrayNode();
                for(var product:scene.path("products")) if(products.contains(product.path("id").asString())) selected.add(product);
                var item=mapper.createObjectNode(); item.set("sourceEventId",event.get("behaviorLogId"));
                item.set("catalogVersion",scene.path("catalogVersion")); item.set("products",selected); entries.add(item);
            }
            if(!entries.isEmpty()) {var c=context.addObject();c.set("sessionId",session.get("sessionId"));c.set("scenes",entries);}
        }
        // Version-matched supplementary catalog only for explicitly referenced products.
        if(root.path("matchingContentCatalog") instanceof ObjectNode catalog) {
            var selected=mapper.createArrayNode();
            for(var p:catalog.path("products")) if(products.contains(p.path("id").asString())) selected.add(p);
            catalog.set("products",selected);catalog.remove(List.of("enabledScenarios","sourceNote","scope"));
        }
        for(var session:timeline.path("sessions")) for(var n:session.path("events")) {
            ObjectNode event=(ObjectNode)n;
            event.remove(List.of("clientEventId","batchId","normalizedEventId","receivedAt","occurredAt","eventSchemaVersion","appVersion","contentVersion","offlineQueued"));
            if(event.path("action") instanceof ObjectNode action) action.remove("stepOrder");
            if(event.path("payload").path("marketContent") instanceof ObjectNode content) {
                content.remove(List.of("movementReplay","availableProductIds"));
                if(content.path("sceneSnapshot") instanceof ObjectNode scene) scene.remove("products");
            }
        }
        // remainingMs repeats timeLimitSeconds and elapsedMs. Omit it only when that identity is exact for the whole request.
        boolean derivable=true;
        for(var session:timeline.path("sessions")) for(var event:session.path("events")) {
            var timing=event.path("payload").path("timing");
            if(!timing.has("remainingMs")) continue;
            derivable&=timing.path("remainingMs").isIntegralNumber()&&timing.path("elapsedMs").isIntegralNumber()&&timing.path("timeLimitSeconds").isIntegralNumber()
                    &&timing.path("remainingMs").asLong()==timing.path("timeLimitSeconds").asLong()*1000-timing.path("elapsedMs").asLong();
        }
        for(var session:timeline.path("sessions")) for(var event:session.path("events")) {
            if(derivable&&event.path("payload").path("timing") instanceof ObjectNode timing) timing.remove("remainingMs");
            // The collector's per-span compression error is bounded by movementContext.maxTimedPositionError, which stays.
            if(event.path("payload").path("marketContent").path("movementSpan") instanceof ObjectNode span) span.remove("maxTimedPositionError");
        }
        root.set("referencedSceneProducts",context);
        root.put("observationInputVersion",VERSION);
        root.put("inputScope","모든 사건 순서·세션 시작 대비 시각·행동·좌표를 제공한다. 수신시각/앱버전 등 운송 메타데이터와 수집기의 구간별 위치 축약 오차(movementSpan.maxTimedPositionError; 상한은 movementContext.maxTimedPositionError)는 원본에 보관한다. timing.remainingMs는 timeLimitSeconds×1000−elapsedMs와 정확히 같은 요청에서는 생략한다. 상품 속성은 목표 및 이 구간 참조 상품만 보충한다. 목록에서 빠졌다고 판매 불가/미노출이라 판단하지 말 것. 원래 표시 상품 목록은 사건에 유지한다. 출처 세션/버전이 같은 상품만 참조한다.");
        root.set("behaviorTimeline",new CompactBehaviorTimeline(mapper).encode(timeline));
        return root;
    }
    private void collect(JsonNode node,Set<String> ids) {
        if(node.isArray()) {node.forEach(n->collect(n,ids));return;}
        if(!node.isObject()) return;
        for(String key:node.propertyNames()) {
            if(Set.of("sceneSnapshot","availableProductIds","movementContext","movementReplay").contains(key)) continue;
            var value=node.get(key);
            if((key.equals("id")||key.equals("itemId")||key.equals("productId")||key.endsWith("ItemId"))&&value.isString()) ids.add(value.asString());
            if(key.endsWith("ProductIds")&&value.isArray()) value.forEach(v->ids.add(v.asString()));
            if(key.equals("cart")&&value.isObject()) ids.addAll(value.propertyNames());
            collect(value,ids);
        }
    }
}
