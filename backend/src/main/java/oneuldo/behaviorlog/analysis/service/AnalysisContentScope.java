package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.personalization.service.MarketQuestCatalog;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Referential projection; uncertain scene scope retains the full catalog. No behavior selection. */
public final class AnalysisContentScope {
    private final ObjectMapper mapper;
    public AnalysisContentScope(ObjectMapper mapper) { this.mapper = mapper; }
    public JsonNode catalog(BehaviorAnalysisInputResponse full) {
        JsonNode raw = mapper.valueToTree(full.input());
        boolean matched = false, complete = true; Set<String> ids = new LinkedHashSet<>();
        for (var session : raw.path("sessions")) {
            Set<String> scenes = new HashSet<>(), supplied = new HashSet<>();
            for (var event : session.path("events")) {
                var payload = event.path("payload");
                if (!MarketQuestCatalog.VERSION.equals(payload.path("catalogVersion").asString())) continue;
                matched = true; var content = payload.path("marketContent");
                String scene = content.path("sceneRef").asString("");
                if (scene.isBlank()) complete = false;
                else {
                    scenes.add(scene);
                    if (content.path("sceneSnapshot").path("products").isArray()
                            && !content.path("sceneSnapshot").path("products").isEmpty()
                            && content.path("sceneSnapshot").path("slots").isArray()) supplied.add(scene);
                }
                collect(payload, ids);
            }
            if (!supplied.containsAll(scenes)) complete = false;
        }
        if (!matched) return mapper.createObjectNode();
        ObjectNode context = mapper.valueToTree(MarketQuestCatalog.contentContext());
        if (complete && !ids.isEmpty()) {
            ArrayNode products = mapper.createArrayNode();
            for (var product : context.path("products")) if (ids.contains(product.path("id").asString())) products.add(product);
            context.set("products", products);
            context.put("scope", "전체 데이터셋의 모든 장면 상품 및 목표·사건 참조 상품. 구매 여부로 선별하지 않음. 과거 관측값을 현재 자료로 덮지 말 것.");
        } else context.put("scope", "장면 범위 불명확: 전체 상품 자료 유지");
        return context;
    }
    private void collect(JsonNode node, Set<String> ids) {
        if (node instanceof ObjectNode object) {
            for (String key : object.propertyNames()) {
                var child = object.get(key);
                if ((key.equals("productId") || key.equals("itemId") || key.endsWith("ItemId") || key.equals("id")) && child.isString()) ids.add(child.asString());
                else if (key.endsWith("ProductIds") && child.isArray()) child.forEach(id -> { if (id.isString()) ids.add(id.asString()); });
                collect(child, ids);
            }
        } else if (node.isArray()) node.forEach(child -> collect(child, ids));
    }
}
