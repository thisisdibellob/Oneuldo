package oneuldo.behaviorlog.personalization.service;

import java.util.HashSet;
import java.util.ArrayList;
import java.util.Map;
import java.util.List;
import java.util.Set;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class MarketAiQuestValidator {

    public static final List<String> SHELF_CATEGORY_IDS = List.of("produce", "fresh", "household", "meal", "drink");
    public static final List<String> SHELF_SLOT_IDS = List.of("northwest", "northeast", "middle-west", "middle-center", "middle-east");
    public static final int ADAPTATION_SUMMARY_MAX_LENGTH = 240;
    public static final int ADAPTIVE_BRIEFING_MAX_LINES = 5;

    public MarketAiQuestDraft validate(MarketAiQuestDraft draft) {
        if (draft == null) throw invalid("빈 결과");
        if (draft.difficulty() < 1 || draft.difficulty() > 3) throw invalid("난이도");
        if (draft.scenarioId() == null) throw invalid("시나리오 ID");
        if (draft.timeLimitSeconds() != null) validateTimeLimit(draft.timeLimitSeconds());
        text(draft.title(), 40, "제목", "/title");
        text(draft.description(), 120, "설명", "/description");
        text(draft.successMessage(), 80, "성공 문장", "/successMessage");
        text(draft.adaptationSummary(), ADAPTATION_SUMMARY_MAX_LENGTH, "조정 요약", "/adaptationSummary");
        if (draft.environmentPlan() != null) validateEnvironmentPlan(draft.environmentPlan());
        if (draft.objectives() == null || draft.objectives().size() < 1
                || draft.objectives().size() > 4) throw invalid("목표 개수");
        var productIds = new HashSet<String>();
        int total = 0;
        var lineItems = new ArrayList<Map<String, Object>>();
        for (var objective : draft.objectives()) {
            if (objective == null || !productIds.add(objective.productId())) {
                throw invalid("중복 상품");
            }
            if (MarketQuestCatalog.PRODUCTS.stream().noneMatch(p -> p.id().equals(objective.productId()))) {
                throw new MarketQuestValidationException("상품 ID", Map.of(
                        "code", "UNKNOWN_PRODUCT_ID", "path", "/objectives/" + lineItems.size() + "/productId",
                        "allowedProductIds", MarketQuestCatalog.PRODUCTS.stream().map(MarketQuestCatalog.Product::id).toList()));
            }
            var product = MarketQuestCatalog.require(objective.productId());
            if (objective.quantity() < 1 || objective.quantity() > 3) {
                throw new MarketQuestValidationException("수량", Map.of(
                        "code", "QUANTITY_OUT_OF_RANGE",
                        "path", "/objectives/" + lineItems.size() + "/quantity",
                        "productId", product.id(), "submittedQuantity", objective.quantity(),
                        "minimumQuantity", 1, "maximumQuantity", 3));
            }
            int subtotal = product.price() * objective.quantity();
            total += subtotal;
            lineItems.add(Map.of("productId", product.id(), "unitPrice", product.price(),
                    "quantity", objective.quantity(), "subtotal", subtotal));
        }
        if (draft.budget() < total || draft.budget() > total + 4000) {
            boolean custom = "CUSTOM".equals(draft.scenarioId());
            int minimum = custom ? total : MarketQuestCatalog.requireScenario(draft.scenarioId()).budget();
            int maximum = custom ? total + 4000 : minimum;
            throw new MarketQuestValidationException("예산", Map.of(
                    "code", "BUDGET_OUT_OF_RANGE", "submittedBudget", draft.budget(),
                    "objectiveTotal", total, "minimumBudget", minimum, "maximumBudget", maximum,
                    "lineItems", lineItems));
        }
        if (!"CUSTOM".equals(draft.scenarioId())) {
            var scenario = MarketQuestCatalog.requireScenario(draft.scenarioId());
            if (draft.budget() != scenario.budget() || draft.objectives().size() != scenario.objectives().size()) {
                throw new MarketQuestValidationException("시나리오 콘텐츠 계약", Map.of(
                        "code", "FIXED_SCENARIO_CONTRACT", "scenarioId", scenario.id(),
                        "requiredBudget", scenario.budget(), "requiredObjectives", scenario.objectives()));
            }
            for (var objective : scenario.objectives()) {
                if (draft.objectives().stream().noneMatch(o -> o.productId().equals(objective.productId())
                        && o.quantity() == objective.quantity())) throw invalid("시나리오 목표");
            }
        }
        sentences(draft.briefing(), 1, draft.runtimePlan() == null ? 3 : ADAPTIVE_BRIEFING_MAX_LINES, "안내");
        sentences(draft.checkoutDialogue(), 2, 2, "계산대 대화");
        if (draft.reasonCodes() == null || draft.reasonCodes().isEmpty()
                || draft.reasonCodes().size() > 8) throw invalid("사유 코드");
        draft.reasonCodes().forEach(code -> {
            if (code == null || !code.matches("[A-Z0-9_]{2,50}")) throw invalid("사유 코드 형식");
        });
        return draft;
    }

    public MarketAiQuestDraft validate(MarketAiQuestDraft draft, int expectedDifficulty) {
        MarketAiQuestDraft validated = validate(draft);
        if (validated.difficulty() != expectedDifficulty) {
            throw invalid("AI 추천 난이도 불일치");
        }
        return validated;
    }

    /** New generations must carry the AI's actual choice; old stored JSON remains readable. */
    public MarketAiQuestDraft validateGenerated(MarketAiQuestDraft draft, int expectedDifficulty) {
        var validated = validate(draft, expectedDifficulty);
        if (validated.environmentPlan() == null) {
            throw new MarketQuestValidationException("매대 배치 계획", Map.of(
                    "code", "ENVIRONMENT_PLAN_REQUIRED", "path", "/environmentPlan",
                    "requiredCategoryIds", SHELF_CATEGORY_IDS, "rationaleMaxLength", 160));
        }
        if (validated.timeLimitSeconds() == null) throw timeError("TIME_LIMIT_REQUIRED", Map.of("submittedNull", true));
        return validated;
    }

    /** Check the raw JSON before Jackson can coerce a decimal or string into an Integer. */
    public void validateGeneratedTimeLimitJson(tools.jackson.databind.JsonNode root) {
        var value = root.path("timeLimitSeconds");
        if (value.isMissingNode() || value.isNull())
            throw timeError("TIME_LIMIT_REQUIRED", Map.of("submittedMissing", value.isMissingNode(), "submittedNull", value.isNull()));
        if (!value.isIntegralNumber())
            throw timeError("TIME_LIMIT_MUST_BE_INTEGER", Map.of("submittedType", value.getNodeType().name()));
        if (!value.canConvertToInt())
            throw timeError("TIME_LIMIT_OUT_OF_RANGE", Map.of("submittedSeconds", value.bigIntegerValue()));
        validateTimeLimit(value.asInt());
    }

    /** Preserve AI-selected numeric values: conversion must never round decimals or accept numeric text. */
    public void validateGeneratedNumericJson(tools.jackson.databind.JsonNode root) {
        validateGeneratedTimeLimitJson(root);
        requireRawInteger(root.path("difficulty"), "/difficulty");
        requireRawInteger(root.path("budget"), "/budget");
        int index = 0;
        for (var objective : root.path("objectives"))
            requireRawInteger(objective.path("quantity"), "/objectives/" + index++ + "/quantity");
    }

    /** Report literal container/key errors before DTO conversion turns them into generic parser failures. */
    public void validateGeneratedShapeJson(tools.jackson.databind.JsonNode root) {
        var keys = List.of("difficulty", "scenarioId", "title", "description", "budget", "objectives",
                "briefing", "checkoutDialogue", "successMessage", "adaptationSummary", "reasonCodes", "environmentPlan", "timeLimitSeconds");
        shapeObject(root, "", keys);
        shapeType(root.path("scenarioId"), "/scenarioId", "STRING");
        for (String field : List.of("objectives", "briefing", "checkoutDialogue", "reasonCodes"))
            shapeType(root.path(field), "/" + field, "ARRAY");
        for (int i = 0; i < root.path("objectives").size(); i++) {
            var objective = root.path("objectives").get(i);
            shapeObject(objective, "/objectives/" + i, List.of("productId", "quantity"));
            shapeType(objective.path("productId"), "/objectives/" + i + "/productId", "STRING");
        }
        for (String field : List.of("briefing", "checkoutDialogue", "reasonCodes"))
            for (int i = 0; i < root.path(field).size(); i++)
                shapeType(root.path(field).get(i), "/" + field + "/" + i, "STRING");
        if (root.path("environmentPlan").isMissingNode() || root.path("environmentPlan").isNull())
            throw new MarketQuestValidationException("매대 배치 계획", Map.of("code", "ENVIRONMENT_PLAN_REQUIRED", "path", "/environmentPlan",
                    "requiredCategoryIds", SHELF_CATEGORY_IDS, "rationaleMaxLength", 160));
        shapeObject(root.path("environmentPlan"), "/environmentPlan", List.of("shelfOrder", "rationale"));
        shapeType(root.path("environmentPlan").path("shelfOrder"), "/environmentPlan/shelfOrder", "ARRAY");
        for (int i = 0; i < root.path("environmentPlan").path("shelfOrder").size(); i++)
            shapeType(root.path("environmentPlan").path("shelfOrder").get(i), "/environmentPlan/shelfOrder/" + i, "STRING");
    }

    private void shapeObject(tools.jackson.databind.JsonNode node, String path, List<String> allowed) {
        shapeType(node, path, "OBJECT");
        for (String key : node.propertyNames()) {
            if (!allowed.contains(key))
                throw new MarketQuestValidationException("출력 키", Map.of("code", "INVALID_FIELD_SHAPE", "path", path,
                        "unexpectedKey", key, "allowedKeys", allowed));
        }
    }

    private void shapeType(tools.jackson.databind.JsonNode node, String path, String expected) {
        if (!node.getNodeType().name().equals(expected))
            throw new MarketQuestValidationException("출력 구조", Map.of("code", "INVALID_FIELD_SHAPE", "path", path,
                    "expectedType", expected, "submittedType", node.getNodeType().name(), "submittedMissing", node.isMissingNode()));
    }

    /** Required keys and literal text types are checked before DTO conversion loses missing-field presence. */
    public void validateGeneratedTextJson(tools.jackson.databind.JsonNode root) {
        textJson(root.path("title"), 40, "제목", "/title");
        textJson(root.path("description"), 120, "설명", "/description");
        textJson(root.path("successMessage"), 80, "성공 문장", "/successMessage");
        textJson(root.path("adaptationSummary"), ADAPTATION_SUMMARY_MAX_LENGTH, "조정 요약", "/adaptationSummary");
        if (root.path("environmentPlan").isObject())
            textJson(root.path("environmentPlan").path("rationale"), 160, "매대 배치 이유", "/environmentPlan/rationale");
        for (String field : List.of("briefing", "checkoutDialogue")) {
            var values = root.path(field);
            if (!values.isArray()) continue; // Existing array/count validation reports the container contract.
            for (int index = 0; index < values.size(); index++)
                textJson(values.get(index), 80, "briefing".equals(field) ? "안내" : "계산대 대화", "/" + field + "/" + index);
        }
    }

    private void textJson(tools.jackson.databind.JsonNode value, int maxLength, String field, String path) {
        if (value.isString() && !value.asString().isBlank() && value.asString().length() <= maxLength) return;
        var details = textDetails(maxLength, field, path, value.isString() ? value.asString().length() : 0,
                value.isNull(), value.isString() && value.asString().isBlank());
        details.put("submittedMissing", value.isMissingNode());
        details.put("submittedType", value.getNodeType().name());
        details.put("rawFieldPresenceRecorded", true);
        throw new MarketQuestValidationException(field, Map.copyOf(details));
    }

    private void requireRawInteger(tools.jackson.databind.JsonNode value, String path) {
        var details = new java.util.LinkedHashMap<String, Object>();
        details.put("path", path);
        details.put("expectedType", "INTEGER");
        details.put("submittedType", value.getNodeType().name());
        String code = value.isMissingNode() || value.isNull() ? "NUMERIC_FIELD_REQUIRED"
                : !value.isIntegralNumber() ? "NUMERIC_FIELD_MUST_BE_INTEGER"
                : !value.canConvertToInt() ? "NUMERIC_FIELD_OUT_OF_RANGE" : null;
        if (code == null) return;
        details.put("code", code);
        if (value.isMissingNode() || value.isNull()) {
            details.put("submittedMissing", value.isMissingNode());
            details.put("submittedNull", value.isNull());
        }
        if ("NUMERIC_FIELD_OUT_OF_RANGE".equals(code)) {
            details.put("minimumRepresentableInteger", Integer.MIN_VALUE);
            details.put("maximumRepresentableInteger", Integer.MAX_VALUE);
        }
        throw new MarketQuestValidationException("정수 수치 원본", Map.copyOf(details));
    }

    /** Technical review contract only; semantic adaptation decisions remain with the AI. */
    public Map<String, Object> validateConsistencyReview(tools.jackson.databind.ObjectMapper mapper,
            tools.jackson.databind.JsonNode review, tools.jackson.databind.node.ObjectNode input) {
        return MarketQuestConsistencyReview.validate(mapper, review, input);
    }

    private void validateTimeLimit(int seconds) {
        if (seconds < MarketQuestTimePolicy.MINIMUM_SECONDS || seconds > MarketQuestTimePolicy.MAXIMUM_SECONDS)
            throw timeError("TIME_LIMIT_OUT_OF_RANGE", Map.of("submittedSeconds", seconds));
    }

    private MarketQuestValidationException timeError(String code, Map<String, Object> submitted) {
        var details = new java.util.LinkedHashMap<String, Object>(submitted);
        details.put("code", code);
        details.put("path", "/timeLimitSeconds");
        details.put("minimumSeconds", MarketQuestTimePolicy.MINIMUM_SECONDS);
        details.put("maximumSeconds", MarketQuestTimePolicy.MAXIMUM_SECONDS);
        details.put("requiredType", "integer");
        details.put("policyVersion", MarketQuestTimePolicy.VERSION);
        return new MarketQuestValidationException("제한 시간", Map.copyOf(details));
    }

    public MarketAiQuestDraft validateGenerated(MarketAiQuestDraft draft, int expectedDifficulty,
            MarketAiQuestRequest.EnvironmentContext environmentContext) {
        var validated = validateGenerated(draft, expectedDifficulty);
        var context = validateEnvironmentContext(environmentContext);
        if (context != null && context.preserveShelfOrder()) {
            var requiredOrder = context.shelfSlots().stream().map(MarketAiQuestRequest.ShelfSlot::categoryId).toList();
            if (!requiredOrder.equals(validated.environmentPlan().shelfOrder())) {
                throw new MarketQuestValidationException("보존할 매대 순서", Map.of(
                        "code", "PRESERVED_SHELF_ORDER_MISMATCH", "path", "/environmentPlan/shelfOrder",
                        "requiredShelfOrder", requiredOrder, "preserveShelfOrder", true));
            }
        }
        return validated;
    }

    public void validateEnvironmentPlan(MarketAiQuestDraft.EnvironmentPlan plan) {
        var order = plan.shelfOrder();
        if (order == null || order.size() != 5 || order.stream().anyMatch(id -> id == null || !SHELF_CATEGORY_IDS.contains(id))
                || new HashSet<>(order).size() != 5) {
            throw new MarketQuestValidationException("매대 순서", Map.of(
                    "code", "INVALID_SHELF_ORDER", "path", "/environmentPlan/shelfOrder",
                    "requiredCategoryIds", SHELF_CATEGORY_IDS, "requiredCount", 5));
        }
        text(plan.rationale(), 160, "매대 배치 이유", "/environmentPlan/rationale");
    }

    /** Structural source validation only. This makes no judgment about the person or route. */
    public MarketAiQuestRequest.EnvironmentContext validateEnvironmentContext(MarketAiQuestRequest.EnvironmentContext context) {
        if (context == null) return null;
        if (!Set.of("classic", "aisles", "corner").contains(context.layoutId() == null ? "" : context.layoutId()))
            throw invalidContext("layoutId");
        if (context.world() == null || !positiveCoordinate(context.world().width()) || !positiveCoordinate(context.world().height()))
            throw invalidContext("world");
        double width = context.world().width(), height = context.world().height();
        if (context.spawn() == null || !coordinate(context.spawn().x(), width) || !coordinate(context.spawn().y(), height))
            throw invalidContext("spawn");
        var slots = context.shelfSlots();
        if (slots == null || slots.size() != 5) throw invalidContext("shelfSlots");
        var categories = new HashSet<String>();
        for (int i = 0; i < slots.size(); i++) {
            var slot = slots.get(i);
            if (slot == null || !SHELF_SLOT_IDS.get(i).equals(slot.slotId())
                    || slot.categoryId() == null || !SHELF_CATEGORY_IDS.contains(slot.categoryId()) || !categories.add(slot.categoryId())
                    || !coordinate(slot.x(), width) || !coordinate(slot.y(), height)
                    || !("horizontal".equals(slot.orientation()) || "vertical".equals(slot.orientation())))
                throw invalidContext("shelfSlots/" + i);
        }
        if (context.runtimeContext() != null && (!context.runtimeContext().isObject()
                || context.runtimeContext().toString().length() > 30000)) throw invalidContext("runtimeContext");
        return new MarketAiQuestRequest.EnvironmentContext(context.layoutId(), List.copyOf(slots), context.world(), context.spawn(), context.preserveShelfOrder(), context.runtimeContext());
    }

    private boolean positiveCoordinate(Double value) {
        return value != null && Double.isFinite(value) && value > 0 && value <= 4096;
    }

    private boolean coordinate(Double value, double bound) {
        return value != null && Double.isFinite(value) && value >= 0 && value <= bound;
    }

    private ResponseStatusException invalidContext(String path) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "현재 매장 원본 구조 오류: environmentContext/" + path);
    }

    private void sentences(java.util.List<String> values, int min, int max, String field) {
        if (values == null || values.size() < min || values.size() > max) {
            throw new MarketQuestValidationException(field, Map.of(
                    "code", "INVALID_SENTENCE_COUNT",
                    "path", "안내".equals(field) ? "/briefing" : "/checkoutDialogue",
                    "field", field, "minimumCount", min, "maximumCount", max,
                    "submittedCount", values == null ? 0 : values.size(),
                    "submittedNull", values == null, "maximumCharsPerSentence", 80));
        }
        String path = "안내".equals(field) ? "/briefing" : "/checkoutDialogue";
        for (int index = 0; index < values.size(); index++) text(values.get(index), 80, field, path + "/" + index);
    }

    private void text(String value, int maxLength, String field, String path) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            var details = textDetails(maxLength, field, path, value == null ? 0 : value.length(), value == null,
                    value != null && value.isBlank());
            details.put("rawFieldPresenceRecorded", false);
            throw new MarketQuestValidationException(field, Map.copyOf(details));
        }
    }

    private java.util.LinkedHashMap<String, Object> textDetails(int maxLength, String field, String path,
            int submittedLength, boolean submittedNull, boolean submittedBlank) {
        var details = new java.util.LinkedHashMap<String, Object>();
        details.put("code", "INVALID_TEXT_LENGTH"); details.put("field", field); details.put("path", path);
        details.put("requiredKey", path.substring(path.lastIndexOf('/') + 1)); details.put("expectedType", "STRING");
        details.put("maximumLength", maxLength); details.put("submittedLength", submittedLength);
        details.put("submittedNull", submittedNull); details.put("submittedBlank", submittedBlank);
        details.put("requiresNonNull", true); details.put("requiresNonBlank", true);
        return details;
    }

    private IllegalArgumentException invalid(String field) {
        return new IllegalArgumentException("AI 장보기 퀘스트 검증 실패: " + field);
    }
}
