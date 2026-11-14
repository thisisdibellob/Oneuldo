package oneuldo.behaviorlog.personalization.service;

import java.util.LinkedHashMap;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Call-specific source selection, without rewriting stored history or judging a purchase. */
public final class QuestPracticeHistoryContext {
    private QuestPracticeHistoryContext() {}

    public static ArrayNode project(ObjectMapper mapper, JsonNode history) {
        var result = mapper.createArrayNode();
        if (history == null) return result;
        for (var source : history) {
            var play = source.deepCopy();
            if (play instanceof ObjectNode row) {
                row.remove("priorAiJudgment");
                if (row.path("recordedPractice") instanceof ObjectNode practice) {
                    var originalEvents = practice.path("purchaseEvents");
                    if (!originalEvents.isArray()) {
                        practice.remove("recordedInstructionEvents");
                        result.add(play);
                        continue;
                    }
                    var submissions = mapper.createArrayNode();
                    var expirations = mapper.createArrayNode();
                    var latestProducts = new LinkedHashMap<String, JsonNode>();
                    var finalProducts = new LinkedHashMap<String, JsonNode>();
                    var expiredProducts = new LinkedHashMap<String, JsonNode>();
                    JsonNode finalSubmission = null;
                    JsonNode finalExpiration = null;
                    for (var event : originalEvents) {
                        if (event.path("selectedProduct").isObject()) {
                            var id = event.path("selectedProduct").path("id");
                            if (!id.isString()) id = event.path("itemId");
                            if (id.isString()) latestProducts.put(id.asString(), event);
                        }
                        if ("SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString())) {
                            submissions.add(event.deepCopy());
                            finalSubmission = event;
                            finalProducts = new LinkedHashMap<>(latestProducts);
                        }
                        if ("SHOP.TIME_LIMIT_EXPIRED".equals(event.path("eventCode").asString())) {
                            expirations.add(event.deepCopy());
                            finalExpiration = event;
                            expiredProducts = new LinkedHashMap<>(latestProducts);
                        }
                    }
                    practice.set("purchaseEvents", submissions);
                    if (!expirations.isEmpty()) practice.set("timeLimitExpiredEvents", expirations);
                    practice.remove("recordedInstructionEvents");
                    var submittedDetails = practice.putArray("submittedProductDetails");
                    if (finalSubmission != null && finalSubmission.path("cart") instanceof ObjectNode cart) {
                        for (String id : cart.propertyNames()) {
                            var event = finalProducts.get(id);
                            if (event == null) continue; // Missing recorded labels are not filled from today's catalog.
                            var detail = submittedDetails.addObject().put("productId", id);
                            detail.set("product", event.get("selectedProduct").deepCopy());
                            for (String field : java.util.List.of("sequence", "timeMs"))
                                if (event.has(field)) detail.set(field, event.get(field).deepCopy());
                        }
                    }
                    if (finalExpiration != null && finalExpiration.path("cart") instanceof ObjectNode cart) {
                        var details = practice.putArray("timedOutProductDetails");
                        for (String id : cart.propertyNames()) {
                            var event = expiredProducts.get(id);
                            if (event == null) continue;
                            var detail = details.addObject().put("productId", id);
                            detail.set("product", event.get("selectedProduct").deepCopy());
                            for (String field : java.util.List.of("sequence", "timeMs"))
                                if (event.has(field)) detail.set(field, event.get(field).deepCopy());
                        }
                    }
                }
            }
            result.add(play);
        }
        return result;
    }
}
