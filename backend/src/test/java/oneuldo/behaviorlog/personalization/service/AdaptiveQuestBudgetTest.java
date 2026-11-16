package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** The budget is catalog arithmetic plus the headroom the model chose; nothing else about the quest changes. */
class AdaptiveQuestBudgetTest {
    final JsonMapper mapper=JsonMapper.builder().build();
    int price(String id){return MarketQuestCatalog.require(id).price();}
    ObjectNode quest(String extra) {
        return (ObjectNode)mapper.readTree("{\"title\":\"연습\",\"objectives\":[{\"productId\":\"milk\",\"quantity\":2},{\"productId\":\"banana\",\"quantity\":2},{\"productId\":\"water\",\"quantity\":3}]"+extra+"}");
    }
    int cost(){return price("milk")*2+price("banana")*2+price("water")*3;}

    @Test void the_chosen_headroom_is_added_to_the_exact_catalog_cost() {
        var quest=quest(",\"budgetHeadroom\":1500");var budget=new AdaptiveQuestBudget();budget.apply(quest);
        assertThat(budget.headroom()).isEqualTo(1500);
        assertThat(quest.path("budget").asInt()).isEqualTo(cost()+1500);
        assertThat(quest.has("budgetHeadroom")).isFalse();
        assertThat(quest.path("title").asString()).isEqualTo("연습");assertThat(quest.path("objectives").size()).isEqualTo(3);
    }
    @Test void a_repair_that_changes_the_goals_keeps_the_headroom_and_recomputes_the_budget() {
        var quest=quest(",\"budgetHeadroom\":0");var budget=new AdaptiveQuestBudget();budget.apply(quest);
        assertThat(quest.path("budget").asInt()).isEqualTo(cost());
        ((ObjectNode)quest.path("objectives").get(2)).put("quantity",1);
        budget.apply(quest);
        assertThat(budget.headroom()).isEqualTo(0);
        assertThat(quest.path("budget").asInt()).isEqualTo(cost()-price("water")*2);
    }
    @Test void a_repaired_budget_that_is_a_valid_headroom_for_the_goals_becomes_the_new_choice() {
        var quest=quest(",\"budgetHeadroom\":500");var budget=new AdaptiveQuestBudget();budget.apply(quest);
        quest.put("budget",cost()+3000);budget.apply(quest);
        assertThat(budget.headroom()).isEqualTo(3000);assertThat(quest.path("budget").asInt()).isEqualTo(cost()+3000);
        quest.put("budget",cost()-1);budget.apply(quest);  // below the cost: not a headroom, so the earlier choice stands
        assertThat(budget.headroom()).isEqualTo(3000);assertThat(quest.path("budget").asInt()).isEqualTo(cost()+3000);
    }
    @Test void an_answer_with_a_plain_budget_and_no_earlier_headroom_is_left_for_the_existing_range_check() {
        var quest=quest(",\"budget\":12000");var before=quest.deepCopy();var budget=new AdaptiveQuestBudget();budget.apply(quest);
        assertThat(budget.headroom()).isNull();assertThat(quest).isEqualTo(before);
    }
    @Test void a_headroom_outside_its_range_is_reported_at_its_own_path() {
        assertThatThrownBy(()->new AdaptiveQuestBudget().apply(quest(",\"budgetHeadroom\":5000")))
            .isInstanceOf(MarketQuestValidationException.class).satisfies(e->assertThat(((MarketQuestValidationException)e).details().get("path")).isEqualTo("/budgetHeadroom"));
    }
    @Test void goals_that_are_not_yet_valid_products_leave_the_goal_error_to_the_contract() {
        var quest=(ObjectNode)mapper.readTree("{\"objectives\":[{\"productId\":\"no-such-product\",\"quantity\":1}],\"budgetHeadroom\":1000}");
        assertThat(AdaptiveQuestBudget.cost(quest.path("objectives"))).isNull();
        var budget=new AdaptiveQuestBudget();budget.apply(quest);
        assertThat(budget.headroom()).isEqualTo(1000);
        assertThat(quest.has("budgetHeadroom")).isFalse();assertThat(quest.path("budget").asInt()).isEqualTo(1000);
    }
    @Test void the_reason_written_for_the_headroom_points_at_the_budget_it_became() {
        var quest=quest(",\"budgetHeadroom\":1000,\"observationPlan\":{\"changeReasons\":[{\"path\":\"/objectives\",\"reason\":\"목표\"},{\"path\":\"/budgetHeadroom\",\"reason\":\"여유를 조금 둡니다\"}]}");
        new AdaptiveQuestBudget().apply(quest);
        assertThat(quest.at("/observationPlan/changeReasons/1/path").asString()).isEqualTo("/budget");
        assertThat(quest.at("/observationPlan/changeReasons/1/reason").asString()).isEqualTo("여유를 조금 둡니다");
        assertThat(quest.at("/observationPlan/changeReasons/0/path").asString()).isEqualTo("/objectives");
    }
    @Test void an_enabled_extra_drink_gets_at_least_the_room_for_the_cheapest_allowed_drink() {
        String runtime=",\"runtimePlan\":{\"stockPerProduct\":5,\"stockOverrides\":{},\"learning\":{\"budgetChoiceEnabled\":true,\"choiceBudget\":3000}}";
        var quest=quest(",\"budgetHeadroom\":0"+runtime);
        Integer drink=AdaptiveQuestBudget.cheapestExtraDrink(quest);
        assertThat(drink).isNotNull().isPositive();
        var budget=new AdaptiveQuestBudget();budget.apply(quest);
        assertThat(budget.headroom()).isEqualTo(drink);assertThat(quest.path("budget").asInt()).isEqualTo(cost()+drink);
        // water is a goal here, so it cannot be the extra drink
        assertThat(drink).isNotEqualTo(price("water"));
        var off=quest(",\"budgetHeadroom\":0"+runtime.replace("true","false"));new AdaptiveQuestBudget().apply(off);
        assertThat(off.path("budget").asInt()).isEqualTo(cost());
    }
}
