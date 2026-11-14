package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Raw JSON numbers must survive as the AI selected them; content bounds remain the existing contract. */
class MarketAiQuestNumericSourceContractTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();

    @Test void decimal_and_numeric_text_are_rejected_for_every_selected_integer_field_before_conversion() {
        for (String path : List.of("/difficulty", "/budget", "/objectives/0/quantity", "/timeLimitSeconds")) {
            for (String raw : List.of("2.9", "\"2\"", "2.0", "true")) {
                var source = fixture(); set(source, path, mapper.readTree(raw)); var before = source.deepCopy();
                assertThatThrownBy(() -> validator.validateGeneratedNumericJson(source))
                        .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> {
                            assertThat(e.details()).containsEntry("path", path);
                            assertThat(e.details().get("code")).isEqualTo(path.equals("/timeLimitSeconds")
                                    ? "TIME_LIMIT_MUST_BE_INTEGER" : "NUMERIC_FIELD_MUST_BE_INTEGER");
                        });
                assertThat(source).isEqualTo(before);
            }
        }
    }

    @Test void missing_null_and_integers_that_do_not_fit_the_transport_are_rejected_with_structured_paths() {
        for (String path : List.of("/difficulty", "/budget", "/objectives/0/quantity", "/timeLimitSeconds")) {
            for (String raw : List.of("null", "2147483648", "-2147483649")) {
                var source = fixture(); set(source, path, mapper.readTree(raw));
                assertThatThrownBy(() -> validator.validateGeneratedNumericJson(source))
                        .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("path", path));
            }
            var source = fixture();
            if (path.startsWith("/objectives/")) ((ObjectNode)source.path("objectives").get(0)).remove("quantity");
            else source.remove(path.substring(1));
            assertThatThrownBy(() -> validator.validateGeneratedNumericJson(source))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("path", path).containsEntry("submittedMissing", true));
        }
    }

    @Test void proper_integers_keep_existing_choices_and_existing_content_bounds_are_still_enforced() {
        var source = fixture(); var before = source.deepCopy();
        validator.validateGeneratedNumericJson(source);
        var draft = mapper.treeToValue(source, MarketAiQuestDraft.class);
        assertThat(validator.validateGenerated(draft, 2)).isEqualTo(draft);
        assertThat(source).isEqualTo(before);
        for (int quantity : List.of(0, 4)) {
            var invalid = fixture(); set(invalid, "/objectives/0/quantity", mapper.valueToTree(quantity));
            validator.validateGeneratedNumericJson(invalid);
            assertThatThrownBy(() -> validator.validateGenerated(mapper.treeToValue(invalid, MarketAiQuestDraft.class), 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("code", "QUANTITY_OUT_OF_RANGE"));
        }
        for (int budget : List.of(19399, 23401)) {
            var invalid = fixture().put("budget", budget); validator.validateGeneratedNumericJson(invalid);
            assertThatThrownBy(() -> validator.validateGenerated(mapper.treeToValue(invalid, MarketAiQuestDraft.class), 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("code", "BUDGET_OUT_OF_RANGE"));
        }
        for (int difficulty : List.of(0, 4)) {
            var invalid = fixture().put("difficulty", difficulty); validator.validateGeneratedNumericJson(invalid);
            assertThatThrownBy(() -> validator.validateGenerated(mapper.treeToValue(invalid, MarketAiQuestDraft.class), 2)).hasMessageContaining("난이도");
        }
        for (int seconds : List.of(179, 601)) {
            var invalid = fixture().put("timeLimitSeconds", seconds);
            assertThatThrownBy(() -> validator.validateGeneratedNumericJson(invalid))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class, e -> assertThat(e.details()).containsEntry("code", "TIME_LIMIT_OUT_OF_RANGE"));
        }
    }

    private void set(ObjectNode source, String path, JsonNode value) {
        if (path.startsWith("/objectives/")) ((ObjectNode)source.path("objectives").get(0)).set("quantity", value);
        else source.set(path.substring(1), value);
    }

    private ObjectNode fixture() {
        return (ObjectNode)mapper.valueToTree(new MarketAiQuestDraft(2, "CUSTOM", "구매 연습", "목표 목록에 따라 골라요.", 22000,
                List.of(new MarketAiQuestDraft.Objective("milk", 2), new MarketAiQuestDraft.Objective("banana", 1),
                        new MarketAiQuestDraft.Objective("instant-rice", 2), new MarketAiQuestDraft.Objective("water", 3)),
                List.of("흰 우유 900mL 2개, 바나나 1송이, 즉석밥 3개입 2개, 생수 500mL 3개를 골라요."),
                List.of("장보기를 마쳤다면 제출해요.", "계속 장보거나 중단할 수 있어요."), "연습을 마쳤어요.", "실제 구매 규격과 수를 관찰해요.",
                List.of("OBSERVATION_PRACTICE"), new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "현재 상품군 자리를 유지해요."), 300));
    }
}
