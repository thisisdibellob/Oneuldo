package oneuldo.behaviorlog.personalization.service;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class AdaptiveSettingRepairTest {
    final JsonMapper mapper=JsonMapper.builder().build();
    @Test void coexisting_text_and_disabled_budget_errors_are_reported_together_without_rewriting_candidate(){
        var fixture=(ObjectNode)new AdaptiveMarketQuestService(null,null,null,null,null,null,null,null,mapper).schema();
        fixture.put("adaptationSummary","x".repeat(281));
        ((ObjectNode)fixture.path("runtimePlan").path("learning")).put("choiceBudget",0);
        var before=fixture.deepCopy();var contract=new AdaptiveQuestContract(mapper,new MarketAiQuestValidator());
        var errors=contract.independentSettingIssues(fixture);
        assertThat(errors.stream().map(error->error.get("path"))).containsExactlyInAnyOrder("/adaptationSummary","/runtimePlan/learning/choiceBudget");
        assertThat(fixture).isEqualTo(before);
        fixture.put("adaptationSummary","실제 관찰과 다음 조건을 비교해요.");
        ((ObjectNode)fixture.path("runtimePlan").path("learning")).put("choiceBudget",3000);
        assertThat(contract.independentSettingIssues(fixture)).isEmpty();
    }
}
