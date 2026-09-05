package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestValidator;
import oneuldo.behaviorlog.personalization.service.MarketQuestCatalog;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class MarketContentTest {
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void 공통_카탈로그는_60종이며_가격과_규격과_단위를_함께_제공한다() {
        assertThat(MarketQuestCatalog.PRODUCTS).hasSize(60);
        assertThat(MarketQuestCatalog.PRODUCTS.stream().map(MarketQuestCatalog.Product::id).distinct()).hasSize(60);
        for (String category : List.of("fresh", "produce", "meal", "drink")) {
            assertThat(MarketQuestCatalog.PRODUCTS.stream().filter(p -> p.categoryId().equals(category))).hasSize(15);
        }
        assertThat(MarketQuestCatalog.require("milk").price()).isEqualTo(2200);
        assertThat(MarketQuestCatalog.require("apple").price()).isEqualTo(1200);
        assertThat(MarketQuestCatalog.require("milk-small").attributes()).containsEntry("volume_ml", 200);
        assertThat(MarketQuestCatalog.require("premium-eggs").salesUnit()).isEqualTo("팩");
        assertThat(MarketQuestCatalog.require("brand-sausage").attributes()).containsEntry("brand", "튼튼");
        assertThat(MarketQuestCatalog.PRODUCTS).allMatch(product -> product.initialStock() == 5);
    }

    @Test
    void S02는_초록사과도_허용하고_미구현_시나리오는_선택할_수_없다() {
        assertThat(MarketQuestCatalog.ENABLED_SCENARIOS).extracting(MarketQuestCatalog.Scenario::id).containsExactly("S01", "S02");
        assertThat(MarketQuestCatalog.requireScenario("S02").objectives().getFirst().acceptedProductIds())
                .containsExactlyInAnyOrder("apple", "apple-green");
        assertThat(MarketQuestCatalog.requireScenario("S01").objectives().getFirst().acceptedProductIds()).containsExactly("milk");
        assertThatThrownBy(() -> MarketQuestCatalog.requireScenario("S09")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 시나리오_생성_계약은_검사하지만_사용자_성공실패는_계산하지_않는다() {
        var s01 = draft("S01", 7000, List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("banana", 1)));
        assertThat(validator.validate(s01)).isSameAs(s01);
        assertThatThrownBy(() -> validator.validate(draft("S01", 7000,
                List.of(new MarketAiQuestDraft.Objective("milk-small", 1), new MarketAiQuestDraft.Objective("banana", 1)))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> validator.validate(draft("S09", 7000, s01.objectives())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> validator.validate(draft("CUSTOM", 100,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("apple", 1)))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 확장된_상품도_CUSTOM_목표로_사용할_수_있다() {
        var objectives = List.of(new MarketAiQuestDraft.Objective("milk-small", 1), new MarketAiQuestDraft.Objective("water-small", 1));
        assertThat(validator.validate(draft("CUSTOM", 2000, objectives)).objectives()).isEqualTo(objectives);
    }

    @Test
    void 사건의_콘텐츠_맥락을_정규화나_손실없이_역직렬화한다() {
        var payload = (ShoppingBehaviorPayload) mapper.readValue("""
                {"type":"SHOPPING","catalogVersion":"old-catalog","scenarioId":"S02","scenarioVersion":"old-scenario",
                 "marketContent":{"item":{"id":"apple","price":999},"acceptedProductIds":["apple","apple-green"]}}
                """, BehaviorPayload.class);
        assertThat(payload.catalogVersion()).isEqualTo("old-catalog");
        assertThat(mapper.writeValueAsString(payload.marketContent())).contains("999", "apple-green");
        var old = (ShoppingBehaviorPayload) mapper.readValue("{\"type\":\"SHOPPING\",\"itemId\":\"apple\"}", BehaviorPayload.class);
        assertThat(old.catalogVersion()).isNull();
        assertThat(old.marketContent()).isNull();
    }

    private MarketAiQuestDraft draft(String scenarioId, int budget, List<MarketAiQuestDraft.Objective> objectives) {
        return new MarketAiQuestDraft(1, scenarioId, "연습", "상품을 비교해요.", budget, objectives, List.of("목록을 봐요."),
                List.of("수량을 봐요.", "계산해요."), "연습을 마쳤어요.", "관찰과 연결", List.of("PRACTICE"));
    }
}
