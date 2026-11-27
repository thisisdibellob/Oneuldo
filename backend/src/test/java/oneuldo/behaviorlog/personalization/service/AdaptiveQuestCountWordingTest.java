package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class AdaptiveQuestCountWordingTest {
    final JsonMapper m=JsonMapper.builder().build();

    ObjectNode quest(String... briefing) {
        var q=m.createObjectNode().put("title","사과 1개 2개 사기").put("description","달걀 10개입 1개와 사과 1개 2개");
        q.putArray("objectives").addObject().put("productId","apple").put("quantity",2);
        ((tools.jackson.databind.node.ArrayNode)q.path("objectives")).addObject().put("productId","eggs").put("quantity",1);
        var b=q.putArray("briefing");for(String s:briefing)b.add(s);
        return q;
    }

    @Test void the_count_after_a_count_sized_objective_is_written_by_the_program() {
        var q=quest("사과 1개 2개를 사요.","사과1개 3개","달걀 10개입 1개를 사요.");
        var changes=AdaptiveQuestCountWording.normalize(q);
        assertThat(q.path("briefing").get(0).asString()).isEqualTo("사과 1개짜리 2개를 사요.");
        assertThat(q.path("briefing").get(1).asString()).isEqualTo("사과 1개짜리 3개");
        assertThat(q.path("briefing").get(2).asString()).isEqualTo("달걀 10개입 1개를 사요.");
        assertThat(q.path("title").asString()).isEqualTo("사과 1개짜리 2개 사기");
        assertThat(q.path("description").asString()).isEqualTo("달걀 10개입 1개와 사과 1개짜리 2개");
        assertThat(changes).hasSize(4);
        assertThat(AdaptiveQuestCountWording.normalize(q)).isEmpty();
    }

    @Test void products_that_are_not_objectives_and_other_text_are_left_alone() {
        var q=m.createObjectNode();q.putArray("objectives").addObject().put("productId","eggs").put("quantity",1);
        q.putArray("briefing").add("사과 1개 2개를 사요.");
        assertThat(AdaptiveQuestCountWording.normalize(q)).isEmpty();
        assertThat(q.path("briefing").get(0).asString()).isEqualTo("사과 1개 2개를 사요.");
    }

    @Test void the_catalog_still_has_the_count_sized_products_this_rewrite_targets() {
        assertThat(MarketQuestCatalog.PRODUCTS.stream().filter(p->AdaptiveQuestCountWording.COUNT_SIZE.matcher(p.detail()).matches()).map(MarketQuestCatalog.Product::id))
            .contains("apple","apple-green","pear","banana-single");
    }
}
