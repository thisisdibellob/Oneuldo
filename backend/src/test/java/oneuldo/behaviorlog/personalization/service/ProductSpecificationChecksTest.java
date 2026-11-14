package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ProductSpecificationChecksTest {
    final JsonMapper m=JsonMapper.builder().build();
    ObjectNode mission(String... lines){
        var task=m.createObjectNode().put("catalogVersion",MarketQuestCatalog.VERSION);
        task.putArray("objectives").addObject().put("productId","apple-juice").put("quantity",1);
        var briefing=task.putArray("briefing");for(String line:lines)briefing.add(line);return task;
    }
    @Test void actual_wrong_500ml_apple_juice_is_rejected_without_rewriting_it(){
        var task=mission("사과 주스 500mL 1개를 구매하세요.");var before=task.deepCopy();
        var issues=ProductSpecificationChecks.inspectMission(task);
        assertThat(issues).singleElement().satisfies(i->{assertThat(i.productId()).isEqualTo("apple-juice");assertThat(i.expectedDetail()).isEqualTo("1L");assertThat(i.path()).isEqualTo("/briefing/0");});
        assertThat(task).isEqualTo(before);
    }
    @Test void equivalent_units_spacing_and_another_products_volume_are_not_errors(){
        assertThat(ProductSpecificationChecks.inspectMission(mission("사과주스 1000mL 1개"))).isEmpty();
        assertThat(ProductSpecificationChecks.inspectMission(mission("사과 주스 1L와 생수 500mL를 확인해요"))).isEmpty();
        assertThat(ProductSpecificationChecks.inspectMission(mission("사과 주스와 생수 500mL를 확인해요"))).isEmpty();
        assertThat(ProductSpecificationChecks.inspectMission(mission("사과 주스 500mL가 아니라 1L예요"))).isEmpty();
        var milk=mission("작은 흰 우유 200mL는 다른 상품이에요");milk.withArray("objectives").addObject().put("productId","milk").put("quantity",1);
        assertThat(ProductSpecificationChecks.inspectMission(milk)).isEmpty();
    }
    @Test void historical_version_must_match_and_prior_ai_is_not_actual_source(){
        var wrong=mission("사과 주스 500mL 1개");var root=m.createObjectNode();root.set("mission",wrong);
        assertThat(ProductSpecificationChecks.recordedConflicts(root)).hasSize(1);
        wrong.put("catalogVersion","unknown-historical-catalog");assertThat(ProductSpecificationChecks.recordedConflicts(root)).isEmpty();
        wrong.put("catalogVersion",MarketQuestCatalog.VERSION);var prior=m.createObjectNode();prior.set("currentAnalysis",root);
        assertThat(ProductSpecificationChecks.recordedConflicts(prior)).isEmpty();
    }
}
