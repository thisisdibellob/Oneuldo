package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import tools.jackson.databind.json.JsonMapper;

class MarketQuestRetryFeedbackTest {
    @Test void three_item_plan_cannot_reuse_a_two_item_fixed_scenario() {
        assertThat(MarketQuestCatalog.eligibleScenarioIds(3)).contains("CUSTOM").doesNotContain("S01");
        assertThat(MarketQuestCatalog.eligibleScenarioIds(2)).contains("S01", "CUSTOM");
        for (int count = 2; count <= 4; count++) {
            for (var id : MarketQuestCatalog.eligibleScenarioIds(count)) {
                if (!id.equals("CUSTOM")) assertThat(MarketQuestCatalog.requireScenario(id).objectives()).hasSize(count);
            }
        }
    }
    @Test void old_audit_attempts_remain_readable_after_adding_repair_details() {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var old=mapper.readValue("{\"sequence\":1,\"rawOutput\":\"{}\",\"failureReason\":\"INVALID_AI_QUEST\"}",MarketAiQuestGeneration.Attempt.class);
        assertThat(old.failureReason()).isEqualTo("INVALID_AI_QUEST");
        assertThat(old.validationDetails()).isNull();
        var updated=new MarketAiQuestGeneration.Attempt(2,"{}","INVALID_AI_QUEST",Map.of("objectiveTotal",8600));
        assertThat(mapper.readValue(mapper.writeValueAsString(updated),MarketAiQuestGeneration.Attempt.class).validationDetails())
            .containsEntry("objectiveTotal",8600);
    }

    @Test void recorded_6000_and_8000_budgets_report_exact_cost_without_rewriting_the_draft() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var drafts=mapper.readValue(getClass().getResourceAsStream("/market/underfunded-quests-20260930.json"),MarketAiQuestDraft[].class);
        for (var draft : drafts) {
            assertThatThrownBy(()->new MarketAiQuestValidator().validate(draft))
                .isInstanceOfSatisfying(MarketQuestValidationException.class,e->{
                    assertThat(e.details()).containsEntry("objectiveTotal",8600)
                        .containsEntry("minimumBudget",8600).containsEntry("maximumBudget",12600)
                        .containsEntry("submittedBudget",draft.budget());
                    assertThat(mapper.writeValueAsString(e.details())).contains("banana","milk","curry","2800");
                });
        }
        assertThat(drafts[0].budget()).isEqualTo(6000);
        assertThat(drafts[1].budget()).isEqualTo(8000);
    }

    @Test void quantity_changes_recompute_total_and_bounds_are_inclusive() {
        var base=new MarketAiQuestDraft(2,"CUSTOM","연습","상품을 담아요.",8600,
            List.of(new MarketAiQuestDraft.Objective("milk",2),new MarketAiQuestDraft.Objective("banana",1)),
            List.of("목록을 확인해요."),List.of("상품을 확인해요.","계산해요."),"완료","연습",List.of("PRACTICE"));
        var validator=new MarketAiQuestValidator();
        for (int budget : List.of(8000,12000)) assertThat(validator.validate(withBudget(base,budget))).isNotNull();
        for (int budget : List.of(7999,12001)) assertThatThrownBy(()->validator.validate(withBudget(base,budget)))
            .isInstanceOfSatisfying(MarketQuestValidationException.class,e->assertThat(e.details()).containsEntry("objectiveTotal",8000));
    }

    private static MarketAiQuestDraft withBudget(MarketAiQuestDraft d,int budget) {
        return new MarketAiQuestDraft(d.difficulty(),d.scenarioId(),d.title(),d.description(),budget,d.objectives(),
            d.briefing(),d.checkoutDialogue(),d.successMessage(),d.adaptationSummary(),d.reasonCodes());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans={false,true})
    void invalid_budget_retries_with_facts_without_editing_model_output(boolean custom) {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var member=UUID.randomUUID(); var profileId=UUID.randomUUID();
        var rec=mock(MarketDifficultyRecommendationResponse.class);
        when(rec.profileId()).thenReturn(profileId);
        when(rec.recommendedDifficulty()).thenReturn(2);
        when(rec.adjustments()).thenReturn(new MarketDifficultyRecommendationResponse.Adjustments(2,"LOW","LOW","SIMPLIFIED"));
        var recommendations=mock(MarketDifficultyRecommendationService.class);
        when(recommendations.recommend(member)).thenReturn(rec);
        var profile=mock(AiUserProfileResponse.class);
        when(profile.profileId()).thenReturn(profileId);
        when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
        var profiles=mock(AiUserProfileService.class);
        when(profiles.find(member,profileId)).thenReturn(profile);
        var prompts=spy(new MarketAiQuestPromptFactory(mapper));
        when(prompts.systemPrompt()).thenReturn("system");
        doReturn("{}").when(prompts).userPrompt(any(),any());
        var client=mock(GroqChatClient.class);
        var seen=new ArrayList<String>();
        when(client.complete(anyString(),anyString(),eq(900),eq(0.2))).thenAnswer(call->{
            seen.add(call.getArgument(1));
            var draft=new MarketAiQuestDraft(2,custom?"CUSTOM":"S01","연습","목록의 구매 단위를 확인해요.",seen.size()==1?(custom?5000:6200):7000,
                List.of(new MarketAiQuestDraft.Objective("milk",1),new MarketAiQuestDraft.Objective("banana",1)),
                List.of("목록을 확인해요."),List.of("상품을 확인해요.","수량을 확인해요."),"완료했어요.","규격 비교 연습",List.of("OBSERVATION_PRACTICE"));
            var result=mock(GroqChatClient.GroqChatResult.class);
            when(result.text()).thenReturn(mapper.writeValueAsString(draft));
            when(result.model()).thenReturn("test");
            return result;
        });
        var result=new MarketAiQuestService(prompts,new MarketAiQuestValidator(),recommendations,
            mock(MarketAiQuestAuditService.class),profiles,client,mapper, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class)).generate(member);
        assertThat(seen).hasSize(2);
        assertThat(seen.get(1)).contains(custom?"BUDGET_OUT_OF_RANGE":"FIXED_SCENARIO_CONTRACT");
        if(custom) assertThat(seen.get(1)).contains("5800","9800","5000","lineItems","milk","banana");
        else assertThat(seen.get(1)).contains("requiredBudget","7000");
        assertThat(result.source()).isEqualTo("AI");
        assertThat(result.quest().budget()).isEqualTo(7000);
    }
}
