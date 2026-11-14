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
    @Test void malformed_review_stops_after_two_reviews_without_regenerating_valid_candidate() {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var member = UUID.randomUUID(); var profileId = UUID.randomUUID();
        var rec = mock(MarketDifficultyRecommendationResponse.class);
        when(rec.profileId()).thenReturn(profileId); when(rec.recommendedDifficulty()).thenReturn(2);
        when(rec.adjustments()).thenReturn(new MarketDifficultyRecommendationResponse.Adjustments(2, "LOW", "LOW", "STANDARD"));
        var recommendations = mock(MarketDifficultyRecommendationService.class);
        when(recommendations.recommend(member)).thenReturn(rec);
        var profile = mock(AiUserProfileResponse.class);
        when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
        var profiles = mock(AiUserProfileService.class); when(profiles.find(member, profileId)).thenReturn(profile);
        var prompts = spy(new MarketAiQuestPromptFactory(mapper));
        when(prompts.systemPrompt()).thenReturn("system"); doReturn("{}").when(prompts).userPrompt(any(), any());
        var client = mock(GroqChatClient.class); var audit = mock(MarketAiQuestAuditService.class);
        String candidate = mapper.writeValueAsString(quantityDraft(1, 7000));
        var generated = mock(GroqChatClient.GroqChatResult.class); when(generated.text()).thenReturn(candidate); when(generated.model()).thenReturn("test");
        var invalidReview = mock(GroqChatClient.GroqChatResult.class); when(invalidReview.text()).thenReturn("{broken");
        when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.OUTPUT_MAX_TOKENS), eq(0.2))).thenReturn(generated);
        when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0))).thenReturn(invalidReview);
        var service = new MarketAiQuestService(prompts, new MarketAiQuestValidator(), recommendations,
            audit, profiles, client, mapper, mock(PracticeHistoryService.class));
        assertThatThrownBy(() -> service.generate(member)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verify(client, times(1)).complete(anyString(), anyString(), eq(MarketAiQuestService.OUTPUT_MAX_TOKENS), eq(0.2));
        verify(client, times(2)).complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0));
        var attempts = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(audit).record(eq(member), any(), any(), isNull(), attempts.capture(), eq("AI_QUEST_FAILED"), anyString());
        assertThat(attempts.getValue()).hasSize(1);
        var attempt = (MarketAiQuestGeneration.Attempt) attempts.getValue().getFirst();
        assertThat(attempt.failureReason()).isEqualTo("AI_REVIEW_INVALID");
        assertThat(attempt.rawOutput()).isEqualTo(candidate);
        assertThat((List<?>) attempt.validationDetails().get("reviewAttempts")).hasSize(2);
    }

    @Test void sentence_count_feedback_preserves_the_rejected_array_and_reports_the_actual_bounds() {
        var validator = new MarketAiQuestValidator();
        for (List<String> briefing : Arrays.asList(null, List.<String>of(), List.of("하나", "둘", "셋", "넷"))) {
            var draft = sentenceDraft(briefing, List.of("목록을 확인해요.", "제출해요."));
            assertThatThrownBy(() -> validator.validate(draft))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, e ->
                    assertThat(e.details()).containsEntry("code", "INVALID_SENTENCE_COUNT")
                        .containsEntry("path", "/briefing").containsEntry("minimumCount", 1)
                        .containsEntry("maximumCount", 3).containsEntry("submittedNull", briefing == null)
                        .containsEntry("submittedCount", briefing == null ? 0 : briefing.size()));
            assertThat(draft.briefing()).isSameAs(briefing);
        }
        var oneCheckout = sentenceDraft(List.of("우유와 바나나를 담아요."), List.of("제출해요."));
        assertThatThrownBy(() -> validator.validate(oneCheckout))
            .isInstanceOfSatisfying(MarketQuestValidationException.class, e ->
                assertThat(e.details()).containsEntry("path", "/checkoutDialogue")
                    .containsEntry("minimumCount", 2).containsEntry("maximumCount", 2)
                    .containsEntry("submittedCount", 1));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {0, 1, 2, 3})
    void structural_repair_reaches_the_model_with_bounds_without_clamping_its_output(int repairKind) {
        boolean quantityError = repairKind > 0;
        boolean chainedBudgetError = repairKind == 2;
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var member = UUID.randomUUID(); var profileId = UUID.randomUUID();
        var rec = mock(MarketDifficultyRecommendationResponse.class);
        when(rec.profileId()).thenReturn(profileId); when(rec.recommendedDifficulty()).thenReturn(2);
        when(rec.adjustments()).thenReturn(new MarketDifficultyRecommendationResponse.Adjustments(2, "LOW", "LOW", "STANDARD"));
        var recommendations = mock(MarketDifficultyRecommendationService.class);
        when(recommendations.recommend(member)).thenReturn(rec);
        var profile = mock(AiUserProfileResponse.class);
        when(profile.profileId()).thenReturn(profileId);
        when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
        var profiles = mock(AiUserProfileService.class); when(profiles.find(member, profileId)).thenReturn(profile);
        var prompts = spy(new MarketAiQuestPromptFactory(mapper));
        when(prompts.systemPrompt()).thenReturn("system"); doReturn("{}").when(prompts).userPrompt(any(), any());
        var client = mock(GroqChatClient.class); var seen = new ArrayList<String>();
        when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0)))
            .thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
        var rejected = quantityError ? quantityDraft(4, 18000)
            : sentenceDraft(List.of("하나", "둘", "셋", "넷"), List.of("목록을 확인해요.", "제출해요."));
        var corrected = quantityError ? quantityDraft(3, 15000)
            : sentenceDraft(List.of("우유 900mL 1개와 바나나 1송이를 담아요."), List.of("목록을 확인해요.", "제출해요."));
        when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.OUTPUT_MAX_TOKENS), eq(0.2))).thenAnswer(call -> {
            seen.add(call.getArgument(1)); var result = mock(GroqChatClient.GroqChatResult.class);
            var next = repairKind == 3 && seen.size() < 5 ? rejected : seen.size() == 1 ? rejected
                : chainedBudgetError && seen.size() == 2 ? quantityDraft(3, 12000) : corrected;
            when(result.text()).thenReturn(mapper.writeValueAsString(next));
            when(result.model()).thenReturn("test"); return result;
        });
        var service = new MarketAiQuestService(prompts, new MarketAiQuestValidator(), recommendations,
            mock(MarketAiQuestAuditService.class), profiles, client, mapper, mock(PracticeHistoryService.class));
        if(repairKind >= 2) {
            assertThatThrownBy(() -> service.generate(member)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(seen).hasSize(2);
            assertThat(seen.get(1)).contains("QUANTITY_OUT_OF_RANGE", "/objectives/1/quantity");
            verify(client, never()).complete(anyString(),anyString(),eq(MarketAiQuestService.REVIEW_MAX_TOKENS),eq(0.0));
            return;
        }
        var result = service.generate(member);
        assertThat(seen).hasSize(repairKind == 3 ? 5 : chainedBudgetError ? 3 : 2);
        if (chainedBudgetError) assertThat(seen.get(2)).contains("BUDGET_OUT_OF_RANGE",
            "objectiveTotal", "13000", "minimumBudget", "maximumBudget", "17000", "objectives.quantity는 1~3");
        if (quantityError) {
            assertThat(seen.get(1)).contains("QUANTITY_OUT_OF_RANGE", "/objectives/1/quantity",
                "minimumQuantity", "maximumQuantity", "submittedQuantity", "원 단가×새 수량");
            assertThat(rejected.objectives().get(1).quantity()).isEqualTo(4);
            assertThat(rejected.budget()).isEqualTo(18000);
            assertThat(result.quest().objectives().get(1).quantity()).isEqualTo(3);
            assertThat(result.quest().budget()).isEqualTo(15000);
        } else {
            assertThat(seen.get(1)).contains("INVALID_SENTENCE_COUNT", "/briefing", "maximumCount", "minimumCount", "submittedCount", "최대 3문장");
            assertThat(rejected.briefing()).hasSize(4);
            assertThat(result.quest().objectives()).isEqualTo(rejected.objectives());
        }
        assertThat(result.quest().briefing()).isEqualTo(corrected.briefing());
        assertThat(result.source()).isEqualTo("AI");
    }

    @Test void quantity_bounds_report_the_precise_item_and_retain_the_rejected_quantity() {
        for (int quantity : List.of(0, 4)) {
            var draft = quantityDraft(quantity, 18000);
            assertThatThrownBy(() -> new MarketAiQuestValidator().validate(draft))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, e ->
                    assertThat(e.details()).containsEntry("code", "QUANTITY_OUT_OF_RANGE")
                        .containsEntry("path", "/objectives/1/quantity").containsEntry("productId", "banana")
                        .containsEntry("submittedQuantity", quantity).containsEntry("minimumQuantity", 1)
                        .containsEntry("maximumQuantity", 3));
            assertThat(draft.objectives().get(1).quantity()).isEqualTo(quantity);
        }
    }

    private static MarketAiQuestDraft quantityDraft(int quantity, int budget) {
        return new MarketAiQuestDraft(2, "CUSTOM", "연습", "구매 단위를 확인해요.", budget,
            List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("banana", quantity)),
            List.of("우유 900mL 1개와 바나나 " + quantity + "송이를 담아요."),
            List.of("목록을 확인해요.", "제출해요."), "완료", "구매 단위 연습", List.of("PRACTICE"),
            new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "현재 상품군 배치를 유지해요."), 300);
    }

    private static MarketAiQuestDraft sentenceDraft(List<String> briefing, List<String> checkout) {
        return new MarketAiQuestDraft(2, "S01", "연습", "목록을 확인해요.", 7000,
            List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("banana", 1)),
            briefing, checkout, "완료", "규격 비교 연습", List.of("PRACTICE"),
            new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "현재 상품군 배치를 유지해요."), 300);
    }

    @Test void missing_catalog_product_reports_the_exact_objective_and_real_choices() {
        var draft=new MarketAiQuestDraft(2,"CUSTOM","우유와 빵","규격 비교 연습",6200,
            List.of(new MarketAiQuestDraft.Objective("milk",1),new MarketAiQuestDraft.Objective("bread",1)),
            List.of("우유와 빵을 담아요."),List.of("목록을 비교해요.","다르면 바꿔요."),"완료","새 품목 연습",List.of("PRACTICE"));
        assertThatThrownBy(()->new MarketAiQuestValidator().validate(draft))
            .isInstanceOfSatisfying(MarketQuestValidationException.class,e->{
                assertThat(e.details()).containsEntry("code","UNKNOWN_PRODUCT_ID")
                    .containsEntry("path","/objectives/1/productId");
                assertThat((List<String>)e.details().get("allowedProductIds")).contains("milk","banana").doesNotContain("bread");
            });
        assertThat(draft.objectives().get(1).productId()).isEqualTo("bread");
    }
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
        when(client.complete(anyString(),anyString(),eq(MarketAiQuestService.REVIEW_MAX_TOKENS),eq(0.0)))
            .thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
        var seen=new ArrayList<String>();
        when(client.complete(anyString(),anyString(),eq(MarketAiQuestService.OUTPUT_MAX_TOKENS),eq(0.2))).thenAnswer(call->{
            seen.add(call.getArgument(1));
            var draft=new MarketAiQuestDraft(2,custom?"CUSTOM":"S01","연습","목록의 구매 단위를 확인해요.",seen.size()==1?(custom?5000:6200):7000,
                List.of(new MarketAiQuestDraft.Objective("milk",1),new MarketAiQuestDraft.Objective("banana",1)),
                List.of("목록을 확인해요."),List.of("상품을 확인해요.","수량을 확인해요."),"완료했어요.","규격 비교 연습",List.of("OBSERVATION_PRACTICE"),
                new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS,"상품 규격 비교에 집중하도록 상품군 배정을 유지해요."), 300);
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
