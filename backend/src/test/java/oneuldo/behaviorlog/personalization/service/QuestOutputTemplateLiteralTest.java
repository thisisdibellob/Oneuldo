package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** The model writes back what the output template shows, so the template must reach it as plain objects. */
class QuestOutputTemplateLiteralTest {
    final JsonMapper mapper=JsonMapper.builder().build();
    static final String ENVIRONMENT="{\"layoutId\":\"classic\",\"employeeCount\":2,\"customerCount\":2,\"pillarCount\":1,\"chairCount\":0,\"cashierCount\":1,\"kioskLane\":\"none\",\"entranceConstruction\":false}";
    ObjectNode source() {
        var source=mapper.createObjectNode();var plays=source.putArray("previousPlays");
        for(int i=0;i<6;i++)plays.addObject().set("environment",mapper.readTree(ENVIRONMENT.replace("\"employeeCount\":2","\"employeeCount\":"+(1+i%3))));
        source.putObject("outputSchema").putObject("runtimePlan").set("environment",mapper.readTree(ENVIRONMENT));
        var design=source.putObject("requiredAiDesign").put("path","/runtimePlan/environment/layoutId").put("reason","이유");design.put("value","aisles");
        return source;
    }
    @Test void repeated_source_objects_become_tuples_but_the_output_template_stays_an_object() {
        var source=source();var encoded=new AdaptiveObjectTuples(mapper).encode(source);
        assertThat(encoded.has(AdaptiveObjectTuples.FIELD)).isTrue();
        assertThat(encoded.path("previousPlays").get(0).path("environment").isArray()).isTrue();
        assertThat(encoded.path("outputSchema")).isEqualTo(source.path("outputSchema"));
        assertThat(encoded.path("outputSchema").at("/runtimePlan/environment").isObject()).isTrue();
        assertThat(encoded.path("requiredAiDesign")).isEqualTo(source.path("requiredAiDesign"));
        assertThat(encoded.path(AdaptiveObjectTuples.RULE_FIELD).asString()).endsWith(AdaptiveObjectTuples.LITERAL_RULE);
        assertThat(AdaptiveObjectTuples.decode(mapper,encoded)).isEqualTo(source);
    }
    @Test void a_request_without_those_fields_keeps_the_earlier_rule_and_still_decodes() {
        var source=source();source.remove(AdaptiveObjectTuples.LITERAL);
        var encoded=new AdaptiveObjectTuples(mapper).encode(source);
        assertThat(encoded.path(AdaptiveObjectTuples.RULE_FIELD).asString()).isEqualTo(AdaptiveObjectTuples.RULE);
        assertThat(AdaptiveObjectTuples.decode(mapper,encoded)).isEqualTo(source);
    }
    @Test void a_setting_list_in_template_order_is_read_as_the_same_object_and_other_shapes_are_left_alone() {
        var template=mapper.readTree("{\"runtimePlan\":{\"environment\":"+ENVIRONMENT+",\"learning\":{\"stockoutProductId\":null,\"allowSubstitution\":true,\"budgetChoiceEnabled\":false,\"choiceBudget\":3000,\"checkoutReviewMode\":\"normal\"}}}");
        var candidate=mapper.readTree("{\"runtimePlan\":{\"environment\":[\"classic\",1,1,0,0,2,\"none\",false],\"learning\":[\"G\",null,false,false,3000,\"normal\"],\"matchRule\":\"exact\"}}");
        assertThat(AdaptiveQuestDesign.restoreSettingObjects(mapper,candidate,template)).isTrue();
        assertThat(candidate.at("/runtimePlan/environment")).isEqualTo(mapper.readTree("{\"layoutId\":\"classic\",\"employeeCount\":1,\"customerCount\":1,\"pillarCount\":0,\"chairCount\":0,\"cashierCount\":2,\"kioskLane\":\"none\",\"entranceConstruction\":false}"));
        assertThat(candidate.at("/runtimePlan/learning")).isEqualTo(mapper.readTree("{\"stockoutProductId\":null,\"allowSubstitution\":false,\"budgetChoiceEnabled\":false,\"choiceBudget\":3000,\"checkoutReviewMode\":\"normal\"}"));
        assertThat(candidate.at("/runtimePlan/matchRule").asString()).isEqualTo("exact");

        var short_=mapper.readTree("{\"runtimePlan\":{\"environment\":[\"classic\",1,1],\"learning\":{\"stockoutProductId\":null}}}");var before=short_.deepCopy();
        assertThat(AdaptiveQuestDesign.restoreSettingObjects(mapper,short_,template)).isFalse();
        assertThat(short_).isEqualTo(before);
    }
    @Test void the_condition_the_model_already_chose_is_written_at_its_path_and_nothing_else_changes() {
        var plan=mapper.readTree("{\"path\":\"/environmentPlan/shelfOrder\",\"value\":[\"fresh\",\"meal\",\"household\",\"drink\",\"produce\"],\"reason\":\"이유\"}");
        var candidate=mapper.readTree("{\"title\":\"연습\",\"environmentPlan\":{\"shelfOrder\":[\"fresh\",\"produce\",\"drink\",\"meal\",\"household\"],\"rationale\":\"근거\"}}");
        assertThat(AdaptiveQuestDesign.apply(plan,candidate)).isTrue();
        assertThat(candidate.at("/environmentPlan/shelfOrder")).isEqualTo(plan.path("value"));
        assertThat(candidate.at("/environmentPlan/rationale").asString()).isEqualTo("근거");assertThat(candidate.path("title").asString()).isEqualTo("연습");
        assertThat(AdaptiveQuestDesign.apply(plan,candidate)).isFalse();
        AdaptiveQuestDesign.requireApplied(plan,candidate);
        // A missing parent is not invented: the existing check still reports it.
        var bare=mapper.readTree("{\"title\":\"연습\"}");
        assertThat(AdaptiveQuestDesign.apply(plan,bare)).isFalse();
        assertThatThrownBy(()->AdaptiveQuestDesign.requireApplied(plan,bare)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void an_id_that_names_no_supplied_event_is_removed_only_while_real_citations_remain() {
        var candidate=mapper.readTree("{\"observationPlan\":{\"behaviorEvidenceIds\":[\"E1\",\"E8\",\"E2\",\"E349\"],\"movementEvidenceIds\":[\"E77\",\"E78\"]}}");
        assertThat(AdaptiveMarketQuestService.dropUnknownCitations(candidate,java.util.Set.of("E1","E2","E3"))).isEqualTo(2);
        assertThat(candidate.at("/observationPlan/behaviorEvidenceIds")).isEqualTo(mapper.readTree("[\"E1\",\"E2\"]"));
        // nothing real is left in this list: it is not emptied here, the contract still rejects it
        assertThat(candidate.at("/observationPlan/movementEvidenceIds")).isEqualTo(mapper.readTree("[\"E77\",\"E78\"]"));
    }
    @Test void after_a_play_that_opened_no_shelf_placements_that_lengthen_a_previous_goal_route_are_not_offered() {
        var reference=AdaptiveQuestDesign.layoutReference(mapper).path("layouts");
        var slots=reference.path("classic").path("slots");
        int near=0,far=0;for(int i=0;i<slots.size();i++){if(slots.get(i).path("referenceRoutePx").asInt()<slots.get(near).path("referenceRoutePx").asInt())near=i;if(slots.get(i).path("referenceRoutePx").asInt()>slots.get(far).path("referenceRoutePx").asInt())far=i;}
        org.junit.jupiter.api.Assumptions.assumeTrue(slots.get(near).path("referenceRoutePx").asInt()<slots.get(far).path("referenceRoutePx").asInt());
        var order=new java.util.ArrayList<>(java.util.List.of("produce","drink","meal","household","household"));
        // fresh (milk) sits on the nearest slot of the previous play
        var categories=new java.util.ArrayList<>(java.util.List.of("produce","drink","meal","household"));var previousOrder=mapper.createArrayNode();
        for(int i=0;i<5;i++)previousOrder.add(i==near?"fresh":categories.remove(0));
        var previous=mapper.createObjectNode();previous.putArray("objectives").addObject().put("productId","milk").put("quantity",1);
        previous.putObject("environmentPlan").set("shelfOrder",previousOrder);previous.putObject("runtimePlan").putObject("environment").put("layoutId","classic");
        var swapped=previousOrder.deepCopy();var moved=swapped.get(far);swapped.set(far,swapped.get(near));swapped.set(near,moved);
        assertThat(AdaptiveQuestDesign.lengthensPreviousTargetRoute(mapper,previous,"/environmentPlan/shelfOrder",swapped)).isTrue();
        assertThat(AdaptiveQuestDesign.lengthensPreviousTargetRoute(mapper,previous,"/environmentPlan/shelfOrder",previousOrder)).isFalse();
        assertThat(AdaptiveQuestDesign.lengthensPreviousTargetRoute(mapper,previous,"/runtimePlan/environment/employeeCount",mapper.valueToTree(3))).isFalse();
        var ended=mapper.readTree("{\"sourceEventDetails\":[{\"eventCode\":\"SHOP.CART_OPENED\"},{\"eventCode\":\"SHOP.SESSION_ENDED\"}]}");
        var opened=mapper.readTree("{\"sourceEventDetails\":[{\"eventCode\":\"SHOP.SHELF_OPENED\"},{\"eventCode\":\"SHOP.SESSION_ENDED\"}]}");
        assertThat(AdaptiveQuestDesign.completedWithoutOpeningAShelf(ended)).isTrue();
        assertThat(AdaptiveQuestDesign.completedWithoutOpeningAShelf(opened)).isFalse();
    }
    @Test void a_text_rewrite_cannot_replace_the_purpose_code_or_drop_fields_it_does_not_carry() {
        var before=mapper.readTree("{\"purpose\":\"GUIDED_PRACTICE\",\"behaviorObservation\":\"이전\",\"evaluationFocus\":\"매대 열기 관찰\"}");
        var candidate=mapper.readTree("{\"observationPlan\":{\"purpose\":\"선택 및 카트 확인 행동 관찰\",\"behaviorObservation\":\"새로 쓴 문장\"}}");
        AdaptiveQuestDeliveryText.keepNonTextChoices(before,candidate);
        assertThat(candidate.at("/observationPlan/purpose").asString()).isEqualTo("GUIDED_PRACTICE");
        assertThat(candidate.at("/observationPlan/behaviorObservation").asString()).isEqualTo("새로 쓴 문장");
        assertThat(candidate.at("/observationPlan/evaluationFocus").asString()).isEqualTo("매대 열기 관찰");
    }
    @Test void a_layout_choice_written_with_a_bare_key_is_read_as_the_same_choice() {
        var options=mapper.createArrayNode();options.addObject().put("choiceId","P1");options.addObject().put("choiceId","P2");
        assertThat(AdaptiveQuestLayoutChoice.selected(AdaptiveQuestLayoutChoice.parse(mapper,"{choiceId:\"P2\"}"),options)).isEqualTo(options.get(1));
        assertThat(AdaptiveQuestLayoutChoice.selected(AdaptiveQuestLayoutChoice.parse(mapper," {\"choiceId\":\"P1\"} "),options)).isEqualTo(options.get(0));
        // Still only a supplied ID, and nothing looser than the one missing pair of quotes.
        assertThatThrownBy(()->AdaptiveQuestLayoutChoice.selected(AdaptiveQuestLayoutChoice.parse(mapper,"{choiceId:\"P9\"}"),options)).isInstanceOf(MarketQuestValidationException.class);
        assertThatThrownBy(()->AdaptiveQuestLayoutChoice.parse(mapper,"P2")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->AdaptiveQuestLayoutChoice.parse(mapper,"{choiceId:P2}")).isInstanceOf(RuntimeException.class);
    }
    @Test void each_offered_layout_and_shelf_order_carries_the_program_computed_route_of_the_played_goals() {
        var previous=mapper.readTree("{\"objectives\":[{\"productId\":\"milk\",\"quantity\":2}],\"environmentPlan\":{\"shelfOrder\":[\"drink\",\"meal\",\"household\",\"fresh\",\"produce\"]},\"runtimePlan\":{\"environment\":{\"layoutId\":\"classic\",\"employeeCount\":1}}}");
        var slots=AdaptiveQuestDesign.layoutReference(mapper).path("layouts");
        int played=slots.path("classic").path("slots").get(3).path("referenceRoutePx").asInt(),corner=slots.path("corner").path("slots").get(3).path("referenceRoutePx").asInt(),first=slots.path("classic").path("slots").get(0).path("referenceRoutePx").asInt();
        var options=mapper.readTree("{\"/runtimePlan/environment/layoutId\":[\"corner\"],\"/runtimePlan/environment/employeeCount\":[2,3],\"/environmentPlan/shelfOrder\":[[\"fresh\",\"meal\",\"household\",\"drink\",\"produce\"]]}");
        var facts=AdaptiveQuestDesign.routeFactsFor(mapper,previous,options);
        assertThat(facts.path("previousPlay").asString()).isEqualTo("fresh="+played+"px");
        assertThat(facts.at("/options/~1runtimePlan~1environment~1layoutId/0").asString()).isEqualTo("corner: fresh="+corner+"px("+(corner>played?"+":"")+(corner-played)+")");
        assertThat(facts.at("/options/~1environmentPlan~1shelfOrder/0").asString()).isEqualTo("[\"fresh\",\"meal\",\"household\",\"drink\",\"produce\"]: fresh="+first+"px("+(first>played?"+":"")+(first-played)+")");
        // Settings without a route (staff, customers) get no line, and no previous play means no facts at all.
        assertThat(facts.path("options").has("/runtimePlan/environment/employeeCount")).isFalse();
        assertThat(AdaptiveQuestDesign.routeFactsFor(mapper,null,options).isEmpty()).isTrue();
        assertThat(AdaptiveQuestDesign.SYSTEM).contains("optionRouteFacts");
        // The request encoder leaves these lines as plain readable text.
        var wire=mapper.createObjectNode();wire.set("optionRouteFacts",facts);wire.set("editableConditions",options);
        assertThat(mapper.writeValueAsString(AdaptiveQuestTransport.encode(mapper,wire))).contains("corner: fresh="+corner+"px(").contains("\"previousPlay\":\"fresh="+played+"px\"");
    }
    @Test void a_change_reason_that_names_a_plan_field_or_a_missing_field_is_reported_at_the_change_reason_list() {
        var contract=new AdaptiveQuestContract(mapper,new MarketAiQuestValidator());
        for(String bad:List.of("/observationPlan/purpose","/budgetHeadroom")) {
            var quest=mapper.readTree("{\"budget\":1000,\"observationPlan\":{\"purpose\":\"GUIDED_PRACTICE\",\"changeReasons\":[{\"path\":\"/budget\",\"reason\":\"유지\"},{\"path\":\""+bad+"\",\"reason\":\"설명\"}]}}");
            assertThatThrownBy(()->contract.changeReasons(quest)).isInstanceOfSatisfying(MarketQuestValidationException.class,failure->{
                assertThat(failure.details()).containsEntry("code","CHANGE_PATH_NOT_IN_QUEST").containsEntry("path","/observationPlan/changeReasons").containsEntry("offendingChangePath",bad);});
        }
        contract.changeReasons(mapper.readTree("{\"budget\":1000,\"observationPlan\":{\"changeReasons\":[{\"path\":\"/budget\",\"reason\":\"유지\"}]}}"));
    }
}
