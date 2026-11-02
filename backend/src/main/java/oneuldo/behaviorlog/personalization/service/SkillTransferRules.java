package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import tools.jackson.databind.JsonNode;

/**
 * Catalog and recorded-purchase facts for size/pack-unit practice. No user judgment:
 * a family is products shelved under one name ("흰 우유", "작은 흰 우유", "큰 흰 우유"),
 * and a missed family is one where a recorded checkout held another variant than the task's target.
 */
public final class SkillTransferRules {
    private static final List<String> COMPARISON_WORDS = List.of("비교", "같은지");

    private SkillTransferRules() {}

    /** Families with at least two shelved variants, reserved families removed. */
    public static List<List<String>> families(List<String> reserved) {
        var result = new ArrayList<List<String>>();
        for (var family : allFamilies()) {
            if (family.stream().noneMatch(reserved::contains)) result.add(family);
        }
        return List.copyOf(result);
    }

    public static List<List<String>> describedFamilies(List<String> reserved) {
        var result = new ArrayList<List<String>>();
        for (var family : families(reserved)) {
            result.add(family.stream().map(id -> {
                var p = MarketQuestCatalog.require(id);
                return p.id() + " " + p.name() + " " + p.detail();
            }).toList());
        }
        return List.copyOf(result);
    }

    static List<List<String>> allFamilies() {
        var result = new ArrayList<List<String>>();
        var placed = new HashSet<String>();
        for (var base : MarketQuestCatalog.PRODUCTS) {
            if (placed.contains(base.id())) continue;
            var family = new ArrayList<String>(List.of(base.id()));
            // Same name or "<qualifier> name", and a different size/pack detail (초록 사과 1개 is not a size variant of 사과 1개).
            for (var other : MarketQuestCatalog.PRODUCTS)
                if (other != base && !other.detail().equals(base.detail())
                        && (other.name().equals(base.name()) || other.name().endsWith(" " + base.name()))) family.add(other.id());
            if (family.size() > 1) { result.add(List.copyOf(family)); placed.addAll(family); }
        }
        return result;
    }

    static Optional<List<String>> familyOf(String productId) {
        return allFamilies().stream().filter(f -> f.contains(productId)).findFirst();
    }

    /**
     * Families missed in a recorded play and not bought correctly in any later play.
     * Reads only recordedPractice task objectives and checkout carts.
     */
    public static List<List<String>> unresolvedMissedFamilies(JsonNode history, List<String> reserved) {
        var open = new LinkedHashMap<List<String>, Boolean>();
        if (history == null) return List.of();
        for (var play : history) {
            var practice = play.path("recordedPractice");
            Set<String> targets = new LinkedHashSet<>();
            for (var task : practice.path("tasks"))
                for (var objective : task.path("mission").path("objectives"))
                    if (objective.hasNonNull("productId")) targets.add(objective.path("productId").asString());
            JsonNode submitted = null;
            for (var event : practice.path("purchaseEvents"))
                if ("SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString()) && event.path("cart").isObject())
                    submitted = event.path("cart");
            if (submitted == null) continue;
            var cart = submitted;
            for (var target : targets) {
                var family = familyOf(target);
                if (family.isEmpty() || family.get().stream().anyMatch(reserved::contains)) continue;
                boolean correct = cart.path(target).asInt(0) > 0;
                boolean otherVariant = family.get().stream().anyMatch(id -> !id.equals(target) && cart.path(id).asInt(0) > 0);
                if (otherVariant && !correct) open.put(family.get(), true);
                else if (correct && !otherVariant) open.remove(family.get());
            }
        }
        return List.copyOf(open.keySet());
    }

    /** Null when the draft satisfies the practice-design contract; otherwise every broken rule at once, first one as "code". */
    public static Map<String, Object> violation(MarketAiQuestDraft draft, JsonNode history, List<String> reserved) {
        return violation(draft, history, reserved, List.of());
    }

    public static Map<String, Object> violation(MarketAiQuestDraft draft, JsonNode history, List<String> reserved, List<String> heldOut) {
        return violation(draft, history, reserved, heldOut, false);
    }

    public static Map<String, Object> violation(MarketAiQuestDraft draft, JsonNode history, List<String> reserved, List<String> heldOut,
            boolean serverBudget) {
        var found = new ArrayList<Map<String, Object>>();
        if (serverBudget) {
            var shown = String.join(" ", draft.title(), draft.description(), String.join(" ", draft.briefing()),
                    String.join(" ", draft.checkoutDialogue()), draft.successMessage());
            if (MONEY.matcher(shown).find())
                found.add(Map.of("code", "MONEY_IN_TEXT",
                        "rule", "예산은 서버가 정한다. 사용자 문장에 금액(원)을 쓰지 않는다."));
        }
        var objectiveSet = draft.objectives().stream().map(o -> o.productId() + "x" + o.quantity()).collect(java.util.stream.Collectors.toSet());
        for (var id : heldOut) {
            var task = MarketQuestCatalog.requireScenario(id).objectives().stream()
                    .map(o -> o.productId() + "x" + o.quantity()).collect(java.util.stream.Collectors.toSet());
            if (id.equals(draft.scenarioId()) || task.equals(objectiveSet))
                found.add(Map.of("code", "HELD_OUT_TASK_REPEATED", "scenarioId", id,
                        "rule", "확인 과제와 상품·규격·수량이 모두 같은 과제다. 놓친 묶음의 다른 규격(같은 이름의 큰 것·작은 것·낱개 등)이나 같은 실수가 나올 다른 상품으로 바꾼다."));
        }
        var ids = draft.objectives().stream().map(MarketAiQuestDraft.Objective::productId).toList();
        var noVariant = ids.stream().filter(id -> familyOf(id).isEmpty()).toList();
        if (!noVariant.isEmpty()) found.add(Map.of("code", "NO_SHELF_VARIANT", "productIds", noVariant,
                "rule", "진열대에 같은 이름의 다른 규격·포장 단위가 없는 상품은 규격 비교 연습이 되지 않는다. sizeVariantFamilies의 상품으로 바꾼다.",
                "sizeVariantFamilies", describedFamilies(reserved)));
        var missed = unresolvedMissedFamilies(history, reserved);
        if (!missed.isEmpty() && ids.stream().noneMatch(id -> missed.stream().anyMatch(f -> f.contains(id))))
            found.add(Map.of("code", "MISSED_FAMILY_NOT_PRACTISED", "missedFamilies", missed,
                    "rule", "기록된 구매에서 목표와 다른 규격을 산 뒤 아직 맞게 사지 않은 상품 묶음이다. 이 중 한 묶음의 상품(같은 상품 또는 다른 규격)을 objectives에 넣는다."));
        var briefing = String.join(" ", draft.briefing());
        var missing = draft.objectives().stream().map(o -> MarketQuestCatalog.require(o.productId()))
                .filter(p -> !briefing.contains(p.name()) || !briefing.contains(coreDetail(p.detail())))
                .map(p -> p.name() + " " + coreDetail(p.detail())).toList();
        if (!missing.isEmpty())
            found.add(Map.of("code", "BRIEFING_OBJECTIVE_MISSING", "missing", missing,
                    "rule", "briefing에 모든 목표 상품의 이름·규격·구매 수량을 빠짐없이 쓴다."));
        if (COMPARISON_WORDS.stream().noneMatch(briefing::contains))
            found.add(Map.of("code", "COMPARISON_METHOD_MISSING",
                    "rule", "briefing에 '상품 이름 아래 숫자와 단위가 목록과 같은지 봐요'처럼 특정 오답을 지목하지 않는 일반 비교 방법을 한 문장 넣는다."));
        var genericMethod = draft.briefing().stream().anyMatch(sentence -> COMPARISON_WORDS.stream().anyMatch(sentence::contains)
                && draft.objectives().stream().noneMatch(o -> sentence.contains(shortName(o.productId()))));
        if (COMPARISON_WORDS.stream().anyMatch(briefing::contains) && !genericMethod)
            found.add(Map.of("code", "METHOD_SENTENCE_ITEM_SPECIFIC",
                    "rule", "briefing에 상품 이름이 없는 비교 방법 문장을 하나 둔다(예: '상품 이름 아래 숫자와 단위를 목록과 비교해요'). 품목 힌트는 그 문장과 따로 쓴다."));
        var checkout = String.join(" ", draft.checkoutDialogue());
        var missedObjectives = draft.objectives().stream().map(MarketAiQuestDraft.Objective::productId)
                .filter(id -> missed.stream().anyMatch(f -> f.contains(id))).toList();
        boolean namesItems = draft.objectives().stream().anyMatch(o -> checkout.contains(shortName(o.productId())));
        var unnamed = missedObjectives.stream().filter(id -> !checkout.contains(shortName(id))).map(SkillTransferRules::shortName).toList();
        if (namesItems && !unnamed.isEmpty())
            found.add(Map.of("code", "CORRECTION_SKIPS_MISSED_ITEM", "missing", unnamed,
                    "rule", "계산 직전 안내가 품목을 짚는다면 놓친 묶음 품목을 모두 짚는다. 아니면 품목 이름 없이 장바구니 전체를 목록과 보게 한다."));
        if (!checkout.contains("장바구니") || CHECKOUT_DIMENSIONS.stream().noneMatch(checkout::contains))
            found.add(Map.of("code", "CHECKOUT_CHECK_MISSING",
                    "rule", "checkoutDialogue 첫 문장은 '장바구니의 이름·규격·개수가 목록과 같은지 봐요'처럼 장바구니의 규격·개수를 목록과 다시 보는 문장이다. 앱 기본 문구를 그대로 쓰지 않는다."));
        var visible = String.join(" ", draft.title(), draft.description(), briefing, checkout, draft.successMessage());
        var reservedNames = reserved.stream().map(MarketQuestCatalog::require).map(MarketQuestCatalog.Product::name)
                .filter(visible::contains).distinct().toList();
        if (!reservedNames.isEmpty())
            found.add(Map.of("code", "RESERVED_NAME_IN_TEXT", "names", reservedNames,
                    "rule", "확인 과제용 상품 이름을 사용자에게 보이는 문장에 쓰지 않는다."));
        var fieldNames = FIELD_NAMES.stream().filter(visible::contains).toList();
        if (!fieldNames.isEmpty())
            found.add(Map.of("code", "FIELD_NAME_IN_TEXT", "names", fieldNames,
                    "rule", "입력 자료의 필드 이름을 사용자 문장에 쓰지 않는다. '상품 이름 아래 숫자와 단위'처럼 화면에 보이는 말로 쓴다."));
        if (found.isEmpty()) return null;
        return Map.of("code", found.get(0).get("code"), "violations", List.copyOf(found));
    }

    private static final java.util.regex.Pattern MONEY = java.util.regex.Pattern.compile("[0-9][0-9,]*\\s*원");
    private static final List<String> FIELD_NAMES = List.of("detail", "productId", "salesUnit", "objectives");
    private static final List<String> CHECKOUT_DIMENSIONS = List.of("규격", "단위", "숫자", "표시");

    /** Last word of the product name ("작은 흰 우유" → "우유"), the word a shopper hears. */
    static String shortName(String productId) {
        var words = MarketQuestCatalog.require(productId).name().split(" ");
        return words[words.length - 1];
    }

    /** The size/pack part shoppers compare: "무항생제 · 10구" → "10구". */
    static String coreDetail(String detail) {
        var parts = detail.split("·");
        return parts[parts.length - 1].trim();
    }
}
