package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class SkillTransferRulesTest {
    private static final List<String> RESERVED = List.of("barley-tea", "barley-tea-small", "instant-rice", "instant-rice-single");
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void familiesAreSameNameSizeVariantsWithoutReservedOnes() {
        var families = SkillTransferRules.families(RESERVED);
        assertThat(families).contains(List.of("milk", "milk-small", "milk-large"), List.of("banana", "banana-single"),
                List.of("premium-eggs", "premium-eggs-15"), List.of("mild-ramen", "ramen-mild-single"));
        assertThat(families.stream().flatMap(List::stream)).doesNotContain("apple", "apple-green", "seaweed", "instant-rice", "barley-tea");
    }

    @Test
    void missedFamilyStaysOpenUntilALaterCorrectPurchase() {
        var missed = history(play("milk", "{\"milk-small\":1}"), play("juice", "{\"juice\":1}"));
        assertThat(SkillTransferRules.unresolvedMissedFamilies(missed, RESERVED)).containsExactly(List.of("milk", "milk-small", "milk-large"));
        var resolved = history(play("milk", "{\"milk-small\":1}"), play("milk-large", "{\"milk-large\":1}"));
        assertThat(SkillTransferRules.unresolvedMissedFamilies(resolved, RESERVED)).isEmpty();
        var reservedOnly = history(play("instant-rice", "{\"instant-rice-single\":1}"));
        assertThat(SkillTransferRules.unresolvedMissedFamilies(reservedOnly, RESERVED)).isEmpty();
    }

    @Test
    void draftsAreCheckedForShelfVariantsMissedFamiliesAndComparisonMethod() {
        var history = history(play("milk", "{\"milk-small\":1}"), play("juice", "{\"juice\":1}"));
        assertThat(SkillTransferRules.violation(draft("seaweed", "water", "숫자와 단위가 목록과 같은지 봐요."), history, RESERVED))
                .containsEntry("code", "NO_SHELF_VARIANT");
        assertThat(SkillTransferRules.violation(draft("curry", "water", "숫자와 단위가 목록과 같은지 봐요."), history, RESERVED))
                .containsEntry("code", "MISSED_FAMILY_NOT_PRACTISED");
        assertThat(SkillTransferRules.violation(draft("milk-large", "ramen-mild-single", "오늘 살 물건을 골라요."), history, RESERVED))
                .containsEntry("code", "COMPARISON_METHOD_MISSING");
        assertThat(SkillTransferRules.violation(draft("milk-large", "ramen-mild-single", "숫자와 단위를 목록과 비교해요."), history, RESERVED)).isNull();
        // Recorded g6 recommendation-2 shape breaks several rules; all are reported in one retry.
        var g6 = new MarketAiQuestDraft(2, "S02", "연습", "규격 연습", 4000,
                List.of(new MarketAiQuestDraft.Objective("apple", 2), new MarketAiQuestDraft.Objective("water", 1)),
                List.of("사과 2개, 생수 500mL 1개를 골라요."),
                List.of("장보기를 마쳤군요. 목록과 장바구니를 같이 확인해 볼게요.", "최종 구매를 결정하면 목록과 개수가 맞는지 확인할 수 있어요."),
                "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat((List<Map<String, Object>>) SkillTransferRules.violation(g6, history, RESERVED).get("violations"))
                .extracting(v -> v.get("code"))
                .containsExactly("NO_SHELF_VARIANT", "MISSED_FAMILY_NOT_PRACTISED", "COMPARISON_METHOD_MISSING", "CHECKOUT_CHECK_MISSING");
        // Recorded g4 recommendation-2 shape: juice is an objective but the briefing names only milk.
        var partial = new MarketAiQuestDraft(2, "CUSTOM", "연습", "규격 연습", 7000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("juice", 1)),
                List.of("흰 우유 900mL 1개를 골라요.", "작은 흰 우유 200mL와 큰 흰 우유 900mL를 비교해요."),
                List.of("장바구니의 규격을 목록과 같은지 봐요.", "구매를 결정해요."), "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat(SkillTransferRules.violation(partial, history, RESERVED)).containsEntry("code", "BRIEFING_OBJECTIVE_MISSING");
        // The app default checkout text does not re-check sizes.
        var defaultCheckout = withCheckout(draft("milk-large", "ramen-mild-single", "숫자와 단위를 목록과 비교해요."),
                List.of("장보기를 마쳤군요. 목록과 장바구니를 같이 확인해 볼게요.", "최종 구매를 결정하면 목록과 개수가 맞는지 확인할 수 있어요."));
        assertThat(SkillTransferRules.violation(defaultCheckout, history, RESERVED)).containsEntry("code", "CHECKOUT_CHECK_MISSING");
        var reservedName = withCheckout(draft("milk-large", "ramen-mild-single", "보리차 대신 우유예요. 숫자와 단위를 목록과 비교해요."),
                List.of("장바구니의 이름·규격·개수가 목록과 같은지 봐요.", "구매를 결정해요."));
        assertThat((List<Map<String, Object>>) SkillTransferRules.violation(reservedName, history, RESERVED).get("violations"))
                .extracting(v -> v.get("code")).contains("RESERVED_NAME_IN_TEXT");
        var fieldName = withCheckout(draft("milk-large", "ramen-mild-single", "상품 이름 아래 'detail'에 적힌 숫자를 목록과 비교해요."),
                List.of("장바구니의 이름·규격·개수가 목록과 같은지 봐요.", "구매를 결정해요."));
        assertThat(SkillTransferRules.violation(fieldName, history, RESERVED)).containsEntry("code", "FIELD_NAME_IN_TEXT");
    }

    @Test
    void heldOutTaskCopiesItemOnlyMethodAndOneItemCorrectionsAreRejected() {
        var history = history(play2("milk", "banana", "{\"milk-small\":1,\"banana-single\":1}"));
        // Recorded v17 g1/g2 shape: the held-out S01 task itself.
        var s01 = new MarketAiQuestDraft(2, "S01", "연습", "규격 연습", 7000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("banana", 1)),
                List.of("흰 우유 900mL 1개와 바나나 1송이를 골라요.", "상품 이름 아래 숫자와 단위가 목록과 같은지 봐요."),
                List.of("장바구니의 이름·규격·개수가 목록과 같은지 봐요.", "구매를 결정해요."), "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat(SkillTransferRules.violation(s01, history, RESERVED, List.of("S01"))).containsEntry("code", "HELD_OUT_TASK_REPEATED");
        assertThat(SkillTransferRules.violation(s01, history, RESERVED)).isNull();
        // Only an item-named comparison: no reusable method sentence.
        var itemOnly = new MarketAiQuestDraft(2, "CUSTOM", "연습", "규격 연습", 8000,
                List.of(new MarketAiQuestDraft.Objective("milk-large", 1), new MarketAiQuestDraft.Objective("banana", 1)),
                List.of("큰 흰 우유 1.8L 1개와 바나나 1송이를 골라요.", "우유는 1.8L 표시를 목록과 비교해요."),
                List.of("장바구니의 이름·규격·개수가 목록과 같은지 봐요.", "구매를 결정해요."), "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat(SkillTransferRules.violation(itemOnly, history, RESERVED, List.of("S01"))).containsEntry("code", "METHOD_SENTENCE_ITEM_SPECIFIC");
        // Recorded v17 g2 recommendation-2 shape: the correction names milk only.
        var milkOnly = new MarketAiQuestDraft(2, "CUSTOM", "연습", "규격 연습", 8000,
                List.of(new MarketAiQuestDraft.Objective("milk-large", 1), new MarketAiQuestDraft.Objective("banana", 1)),
                List.of("큰 흰 우유 1.8L 1개와 바나나 1송이를 골라요.", "상품 이름 아래 숫자와 단위를 목록과 비교해요."),
                List.of("장바구니 우유의 숫자가 1.8L인지 봐요.", "다르면 우유 수량을 0으로 줄여요."), "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat(SkillTransferRules.violation(milkOnly, history, RESERVED, List.of("S01"))).containsEntry("code", "CORRECTION_SKIPS_MISSED_ITEM");
        var both = new MarketAiQuestDraft(2, "CUSTOM", "연습", "규격 연습", 8000, milkOnly.objectives(), milkOnly.briefing(),
                List.of("장바구니 우유와 바나나의 숫자·단위가 목록과 같은지 봐요.", "다르면 진열대에서 바꿔요."), "완료했어요.", "연습", List.of("PRACTICE"));
        assertThat(SkillTransferRules.violation(both, history, RESERVED, List.of("S01"))).isNull();
    }

    private static String play2(String first, String second, String cart) {
        return "{\"recordedPractice\":{\"tasks\":[{\"mission\":{\"objectives\":[{\"productId\":\"" + first + "\",\"quantity\":1},{\"productId\":\"" + second + "\",\"quantity\":1}]}}],"
                + "\"purchaseEvents\":[{\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"cart\":" + cart + "}]}}";
    }

    private JsonNode history(String... plays) {
        return mapper.readTree("[" + String.join(",", plays) + "]");
    }

    private static String play(String target, String cart) {
        return "{\"recordedPractice\":{\"tasks\":[{\"mission\":{\"objectives\":[{\"productId\":\"" + target + "\",\"quantity\":1}]}}],"
                + "\"purchaseEvents\":[{\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"cart\":" + cart + "}]}}";
    }

    private static MarketAiQuestDraft draft(String first, String second, String briefing) {
        return new MarketAiQuestDraft(2, "CUSTOM", "연습", "규격 연습", 9000,
                List.of(new MarketAiQuestDraft.Objective(first, 1), new MarketAiQuestDraft.Objective(second, 1)),
                List.of(names(first) + ", " + names(second) + "를 골라요.", briefing),
                List.of("장바구니의 이름·규격·개수가 목록과 같은지 봐요.", "구매를 결정해요."), "완료했어요.", "연습", List.of("PRACTICE"));
    }

    private static String names(String id) {
        var p = MarketQuestCatalog.require(id);
        return p.name() + " " + p.detail() + " 1개";
    }

    private static MarketAiQuestDraft withCheckout(MarketAiQuestDraft d, List<String> checkout) {
        return new MarketAiQuestDraft(d.difficulty(), d.scenarioId(), d.title(), d.description(), d.budget(), d.objectives(),
                d.briefing(), checkout, d.successMessage(), d.adaptationSummary(), d.reasonCodes());
    }
}
