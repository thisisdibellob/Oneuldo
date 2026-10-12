package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class AdaptiveQuestProgressionTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final MarketAiQuestValidator validator=new MarketAiQuestValidator();
    final AdaptiveMarketQuestService service=new AdaptiveMarketQuestService(null,null,null,null,null,validator,new AdaptiveQuestContract(mapper,validator),null,mapper);
    ObjectNode task(){return (ObjectNode)service.schema();}
    ObjectNode evidence(ObjectNode task){var result=mapper.createObjectNode();result.putArray("recordedTasks").addObject().set("mission",task);return result;}
    ObjectNode review(boolean same,String support,boolean implemented){return (ObjectNode)mapper.createObjectNode().set("progressionCheck",mapper.createObjectNode().put("sameMechanics",same).put("supportChange",support).put("questionImplemented",implemented).put("explanation","실제 목표와 지원을 대조했습니다"));}

    @Test void identical_task_is_rejected_even_when_title_reason_and_objective_order_change(){
        var previous=task();var next=task();next.put("title","새 제목");next.put("adaptationSummary","다양한 카테고리 관찰");
        var items=next.putArray("objectives");items.add(previous.path("objectives").get(1));items.add(previous.path("objectives").get(0));
        assertThatThrownBy(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,evidence(previous),next))
            .isInstanceOf(MarketQuestValidationException.class).satisfies(e->assertThat(((MarketQuestValidationException)e).details().get("code")).isEqualTo("UNCHANGED_RECOMMENDATION"));
    }
    @Test void latest_actual_task_outranks_old_mission_and_prior_ai_reasons(){
        var old=task();var current=task();current.put("budget",9000);
        var source=evidence(old);source.withArray("recordedTasks").addObject().set("mission",current);
        assertThat(AdaptiveQuestProgression.latestMission(source)).isEqualTo(current);
        assertThatThrownBy(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,source,current)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void real_product_or_environment_change_is_visible_in_literal_comparison(){
        var previous=task();var next=task();((ObjectNode)next.path("objectives").get(1)).put("productId","water");
        var result=AdaptiveQuestProgression.comparison(mapper,evidence(previous),next);
        assertThat(result.path("sameMechanics").asBoolean()).isFalse();assertThat(result.path("changedMechanics").toString()).contains("/objectives");
        assertThat(AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(false,"UNCHANGED",true))).isEmpty();
    }
    @Test void paraphrased_identical_support_cannot_authorize_repeat(){
        var previous=task();var next=task();next.putArray("briefing").add("문장만 다르게 표현했어요");
        AdaptiveQuestProgression.rejectExactRepeat(mapper,evidence(previous),next);
        assertThat(AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(true,"UNCHANGED",true))).hasSize(1);
    }
    @Test void supported_practice_or_support_fading_can_keep_the_same_purchase_conditions(){
        var previous=task();var next=task();next.putArray("briefing").add("목표 상품과 수량만 확인해요");
        assertThat(AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(true,"REDUCED",true))).isEmpty();
        assertThat(AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(true,"INCREASED",true))).isEmpty();
    }
    @Test void changed_task_still_must_implement_the_observation_question(){
        var previous=task();var next=task();next.put("budget",8000);
        assertThat(AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(false,"UNCHANGED",false))).hasSize(1);
        assertThatThrownBy(()->AdaptiveQuestProgression.reviewIssues(mapper,evidence(previous),next,review(true,"UNCHANGED",true))).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void generation_template_does_not_preselect_two_products_or_fixed_world_settings(){
        var template=service.generationSchema(2,3);
        assertThat(template.path("objectives").asString()).contains("exactly 3").doesNotContain("milk").doesNotContain("banana");
        assertThat(template.at("/runtimePlan/environment/employeeCount").isString()).isTrue();
        assertThat(template.at("/environmentPlan/shelfOrder").isString()).isTrue();
        assertThat(template.path("difficulty").asInt()).isEqualTo(2);
    }
    @Test void category_variety_plan_requires_a_new_goal_category_not_just_a_budget_or_shelf_change(){
        var plan=mapper.createObjectNode();plan.putArray("reasonCodes").add("EXPLORE_CATEGORY_VARIETY");
        var previous=task();var next=task();next.put("budget",8000);
        assertThatThrownBy(()->AdaptiveQuestProgression.requirePlannedVariety(plan,evidence(previous),next)).isInstanceOf(MarketQuestValidationException.class);
        ((ObjectNode)next.path("objectives").get(1)).put("productId","water");
        AdaptiveQuestProgression.requirePlannedVariety(plan,evidence(previous),next);
    }
    @Test void previous_actual_three_identical_recommendations_are_now_blocked() throws Exception {
        var base=java.nio.file.Path.of("../output/adaptive-five-persona-20261012/auditor/sessions");
        org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(base));
        var ids=List.of("a47a3b0b-32b8-422b-8d6a-074ce8e8d771","a3c55e4d-baa0-4e2e-a0de-234caa786bbe","9ec324f3-9d95-45fa-9923-d23c682b4280");
        for(int n=1;n<ids.size();n++) {
            var previous=(ObjectNode)mapper.readTree(java.nio.file.Files.readString(base.resolve(ids.get(n-1)).resolve("scene.json"))).path("mission");
            var next=(ObjectNode)mapper.readTree(java.nio.file.Files.readString(base.resolve(ids.get(n)).resolve("scene.json"))).path("mission");
            assertThatThrownBy(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,evidence(previous),next)).isInstanceOf(MarketQuestValidationException.class);
        }
    }
}
