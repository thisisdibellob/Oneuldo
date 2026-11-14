package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class MarketAiShelfPlanContractTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final MarketAiQuestValidator validator = new MarketAiQuestValidator();

    @Test void legacy_saved_drafts_and_responses_remain_readable_without_a_plan() {
        var old = draft(null);
        var json = (tools.jackson.databind.node.ObjectNode)mapper.valueToTree(old);
        json.remove("environmentPlan");
        var restored = mapper.treeToValue(json, MarketAiQuestDraft.class);
        assertThat(restored.environmentPlan()).isNull();
        assertThat(validator.validate(restored)).isEqualTo(old);
        var response = response(restored, "market-ai-quest-v17-source-history-unit");
        assertThat(mapper.readValue(mapper.writeValueAsString(response), MarketAiQuestResponse.class).quest().environmentPlan()).isNull();
    }

    @Test void all_five_categories_must_be_selected_exactly_once_and_choice_is_not_rewritten() {
        var selected = List.of("drink", "household", "meal", "produce", "fresh");
        var chosen = draft(new MarketAiQuestDraft.EnvironmentPlan(selected, "목표 상품군을 찾아 방문 순서를 살피는 연습이에요."));
        assertThat(validator.validateGenerated(chosen, 2)).isSameAs(chosen);
        assertThat(response(chosen, MarketAiQuestPromptFactory.PROMPT_VERSION).quest().environmentPlan().shelfOrder()).containsExactlyElementsOf(selected);
        for (var invalid : List.of(
                List.of("drink", "fresh", "meal", "produce"),
                List.of("drink", "fresh", "meal", "produce", "drink"),
                List.of("drink", "fresh", "meal", "produce", "unknown"),
                List.of("drink", "fresh", "meal", "produce", "household", "fresh"))) {
            assertThatThrownBy(() -> validator.validateGenerated(draft(new MarketAiQuestDraft.EnvironmentPlan(invalid, "방문 순서 연습")), 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class,
                            error -> assertThat(error.details()).containsEntry("code", "INVALID_SHELF_ORDER"));
        }
    }

    @Test void new_generations_require_a_plan_and_a_bounded_reason() {
        assertThatThrownBy(() -> validator.validateGenerated(draft(null), 2))
                .isInstanceOfSatisfying(MarketQuestValidationException.class,
                        error -> assertThat(error.details()).containsEntry("code", "ENVIRONMENT_PLAN_REQUIRED"));
        for (String invalid : List.of("", " ", "가".repeat(161))) {
            assertThatThrownBy(() -> validator.validateGenerated(draft(new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, invalid)), 2))
                    .isInstanceOfSatisfying(MarketQuestValidationException.class,
                            error -> assertThat(error.details()).containsEntry("maximumLength", 160));
        }
    }

    @Test void summary_can_explain_both_task_and_shelf_choice_and_overflow_has_repair_facts() {
        var valid = draft(plan());
        assertThatCode(() -> validator.validateGenerated(withSummary(valid, "가".repeat(240)), 2)).doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateGenerated(withSummary(valid, "가".repeat(241)), 2))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error -> assertThat(error.details())
                        .containsEntry("maximumLength", 240).containsEntry("submittedLength", 241));
    }

    @Test void current_context_is_typed_bounded_and_retains_actual_slot_order_without_geometry_inference() {
        var context = context("corner", MarketAiQuestValidator.SHELF_CATEGORY_IDS);
        assertThat(validator.validateEnvironmentContext(context)).isEqualTo(context);
        assertThat(validator.validateEnvironmentContext(null)).isNull();
        var wire = mapper.readTree(new MarketAiQuestPromptFactory(mapper).withEnvironmentContext("{}", context));
        assertThat(wire.path("currentEnvironmentContext")).isEqualTo(mapper.valueToTree(context));
        assertThat(wire.path("currentEnvironmentScope").asString()).contains("왼쪽 위", "최적 경로", "미제공", "원본");
        var missing = mapper.readTree(new MarketAiQuestPromptFactory(mapper).withEnvironmentContext("{}", null));
        assertThat(missing.path("currentEnvironmentContext").isNull()).isTrue();
    }

    @Test void malformed_source_context_is_rejected_before_any_ai_or_profile_call() {
        var harness = new Harness();
        var base = context("classic", MarketAiQuestValidator.SHELF_CATEGORY_IDS);
        var invalids = new ArrayList<MarketAiQuestRequest.EnvironmentContext>();
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("unknown", base.shelfSlots(), base.world(), base.spawn()));
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", base.shelfSlots().subList(0, 4), base.world(), base.spawn()));
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", base.shelfSlots(), new MarketAiQuestRequest.World(5000.0, 1400.0), base.spawn()));
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", base.shelfSlots(), base.world(), new MarketAiQuestRequest.Point(Double.NaN, 100.0)));
        var slots = new ArrayList<>(base.shelfSlots());
        slots.set(0, new MarketAiQuestRequest.ShelfSlot("northwest", "fresh", 100.0, 200.0, "horizontal"));
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", slots, base.world(), base.spawn()));
        slots = new ArrayList<>(base.shelfSlots());
        slots.set(0, new MarketAiQuestRequest.ShelfSlot("northwest", "produce", Double.POSITIVE_INFINITY, 200.0, "horizontal"));
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", slots, base.world(), base.spawn()));
        slots = new ArrayList<>(base.shelfSlots());
        Collections.swap(slots, 0, 1);
        invalids.add(new MarketAiQuestRequest.EnvironmentContext("classic", slots, base.world(), base.spawn()));
        for (var invalid : invalids) assertThatThrownBy(() -> harness.service.generate(harness.member, invalid))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(harness.client, harness.recommendations, harness.audit);
    }

    @Test void prompt_requires_real_shelf_choice_with_evidence_limits_and_preserves_task_contract() {
        var practice = new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "우유 규격 비교 연습", "관찰 목적", 2, 2, "LOW", "LOW", "STANDARD", List.of("PRACTICE"));
        var analysis = new AiBehaviorAnalysisResponse(UUID.randomUUID(), UUID.randomUUID(), "READY", "test", "test", "test", 1,
                0, Instant.now(), null, new AiBehaviorAnalysis("관찰", List.of(), List.of(), List.of(), practice));
        var factory = new MarketAiQuestPromptFactory(mapper);
        var wire = mapper.readTree(factory.userPrompt(analysis, recommendation(UUID.randomUUID())));
        var decoded = new oneuldo.behaviorlog.analysis.service.LosslessTables(mapper).decode(wire);
        assertThat(decoded.path("outputSchema").path("environmentPlan").path("shelfOrder").size()).isEqualTo(5);
        assertThat(decoded.path("environmentPlanning").path("choiceAndRationale").asString()).contains("많은 이동 샘플만으로", "현재 배치", "textSupport");
        assertThat(decoded.path("textLengthLimits").path("adaptationSummary").asInt()).isEqualTo(240);
        assertThat(decoded.path("constraints").path("budget").asString()).contains("총액+4000");
        assertThat(decoded.path("finalInstruction").asString()).contains("environmentPlan.shelfOrder", "많은 이동 기록만으로 헤맴을 단정하지 않는다");
        assertThat(wire.has("unitPriceWon")).isFalse();
        assertThat(decoded.path("contentContext").path("products").size()).isEqualTo(60);
        for (var metadata : decoded.path("contentContext").path("products")) {
            var id = metadata.path("id").asString();
            assertThat(metadata.has("name") || metadata.has("detail") || metadata.has("salesUnit") || metadata.has("price")).isFalse();
            var combined = (tools.jackson.databind.node.ObjectNode)metadata.deepCopy();
            var presentation = decoded.path("productPresentationById").path(id);
            for (String field : presentation.propertyNames()) combined.set(field, presentation.get(field).deepCopy());
            assertThat(combined).isEqualTo(mapper.valueToTree(MarketQuestCatalog.require(id)));
        }
    }

    @Test void same_shelf_assignment_is_described_as_a_choice_for_observation_without_route_or_effect_guarantees() {
        var practice = new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "우유 규격 비교 연습", "추가 관찰", 2, 2, "LOW", "LOW", "STANDARD", List.of("PRACTICE"));
        var analysis = new AiBehaviorAnalysisResponse(UUID.randomUUID(), UUID.randomUUID(), "READY", "test", "test", "test", 1,
                0, Instant.now(), null, new AiBehaviorAnalysis("관찰", List.of(), List.of(), List.of(), practice));
        var wire = mapper.readTree(new MarketAiQuestPromptFactory(mapper).userPrompt(analysis, recommendation(UUID.randomUUID())));
        var decoded = new oneuldo.behaviorlog.analysis.service.LosslessTables(mapper).decode(wire);
        var scope = decoded.path("environmentPlanning").path("choiceAndRationale").asString();
        assertThat(decoded.path("promptVersion").asString()).isEqualTo(MarketAiQuestPromptFactory.PROMPT_VERSION);
        assertThat(scope).contains("선택 사실과 추가 관찰 목적", "기본 상품군 자리를 유지해 규격 선택을 추가 관찰한다",
                "동일한 실제 동선", "배치 기억", "과거 동선 성공", "이동 부담 배제", "장애물 없음", "효과 보장",
                "과거 상세 동선과 현재 NPC·장애물 원본은 이 호출에 없다");
        assertThat(scope).contains("근거가 아니다", "미기록 조건의 효과를 추정하지 않는다");
        // Wording remains the AI's responsibility; the server checks structure, not a keyword verdict.
        var unsupported = draft(new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "과거 성공한 동선을 유지하여 이동 부담을 배제해요."));
        assertThat(validator.validateGenerated(unsupported, 2)).isSameAs(unsupported);
    }

    @Test void structurally_valid_v18_cache_is_regenerated_under_the_v20_scope() {
        var harness = new Harness();
        var old = response(draft(plan()), "market-ai-quest-v18-ai-shelf-plan");
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(old));
        var generated = harness.service.generate(harness.member);
        assertThat(generated.generationId()).isNotEqualTo(old.generationId());
        assertThat(generated.promptVersion()).isEqualTo(MarketAiQuestPromptFactory.PROMPT_VERSION);
        verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
    }

    @Test void missing_plan_is_retried_with_contract_facts_and_no_server_plan_is_substituted() {
        var harness = new Harness();
        when(harness.client.complete(anyString(), anyString(), eq(MarketAiQuestService.OUTPUT_MAX_TOKENS), eq(0.2)))
                .thenReturn(output(draft(null)), output(draft(plan())));
        var result = harness.service.generate(harness.member);
        var prompts = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(2)).complete(anyString(), prompts.capture(), eq(1200), eq(0.2));
        assertThat(prompts.getAllValues().get(1)).contains("ENVIRONMENT_PLAN_REQUIRED", "requiredCategoryIds", "household");
        assertThat(result.quest().environmentPlan()).isEqualTo(plan());
    }

    @Test void invalid_current_contract_or_old_version_cache_does_not_bypass_new_generation() {
        for (var cached : List.of(response(draft(plan()), "market-ai-quest-v17-source-history-unit"),
                response(draft(null), MarketAiQuestPromptFactory.PROMPT_VERSION),
                response(draft(new MarketAiQuestDraft.EnvironmentPlan(List.of("fresh"), "원본 초안")), MarketAiQuestPromptFactory.PROMPT_VERSION))) {
            var harness = new Harness();
            when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(cached));
            var generated = harness.service.generate(harness.member);
            assertThat(generated.generationId()).isNotEqualTo(cached.generationId());
            verify(harness.client).complete(anyString(), anyString(), eq(1200), eq(0.2));
        }
        var harness = new Harness();
        var cached = response(draft(plan()), MarketAiQuestPromptFactory.PROMPT_VERSION);
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(cached));
        assertThat(harness.service.generate(harness.member)).isSameAs(cached);
        verifyNoInteractions(harness.client);
    }

    @Test void request_fingerprint_changes_with_actual_layout_or_category_and_is_stable_for_same_context() {
        var harness = new Harness();
        var keys = new ArrayList<String>();
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenAnswer(call -> {
            keys.add(call.getArgument(1)); return Optional.empty();
        });
        var first = context("classic", MarketAiQuestValidator.SHELF_CATEGORY_IDS);
        harness.service.generate(harness.member, first);
        harness.service.generate(harness.member, first);
        harness.service.generate(harness.member, context("aisles", MarketAiQuestValidator.SHELF_CATEGORY_IDS));
        harness.service.generate(harness.member, context("classic", List.of("fresh", "produce", "household", "meal", "drink")));
        assertThat(keys.get(0)).isEqualTo(keys.get(1));
        assertThat(Set.of(keys.get(0), keys.get(2), keys.get(3))).hasSize(3);
        var prompt = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(4)).complete(anyString(), prompt.capture(), eq(1200), eq(0.2));
        assertThat(mapper.readTree(prompt.getAllValues().getFirst()).path("currentEnvironmentContext")).isEqualTo(mapper.valueToTree(first));
    }

    @Test void manual_shelf_order_request_is_enforced_for_generated_and_cached_plans_with_targeted_repair() {
        var order = List.of("fresh", "produce", "household", "meal", "drink");
        var current = context("classic", order);
        var preserved = new MarketAiQuestRequest.EnvironmentContext(current.layoutId(), current.shelfSlots(), current.world(), current.spawn(), true);
        assertThatThrownBy(() -> validator.validateGenerated(draft(plan()), 2, preserved))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error -> assertThat(error.details())
                        .containsEntry("code", "PRESERVED_SHELF_ORDER_MISMATCH").containsEntry("requiredShelfOrder", order));
        assertThatCode(() -> validator.validateGenerated(draft(plan()), 2, current)).doesNotThrowAnyException();
        var retained = new MarketAiQuestDraft.EnvironmentPlan(order, "현재 매대 순서를 유지하며 목표 규격을 비교하는 연습이에요.");
        var harness = new Harness();
        var cached = response(draft(plan()), MarketAiQuestPromptFactory.PROMPT_VERSION);
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenReturn(Optional.of(cached));
        when(harness.client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(draft(plan())), output(draft(retained)));
        var result = harness.service.generate(harness.member, preserved);
        assertThat(result.generationId()).isNotEqualTo(cached.generationId());
        assertThat(result.quest().environmentPlan()).isEqualTo(retained);
        var prompts = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(harness.client, times(2)).complete(anyString(), prompts.capture(), eq(1200), eq(0.2));
        assertThat(prompts.getAllValues().get(1)).contains("PRESERVED_SHELF_ORDER_MISMATCH", "requiredShelfOrder", "Preserve valid fields");
        assertThat(mapper.readTree(prompts.getAllValues().getFirst()).path("currentEnvironmentContext").path("preserveShelfOrder").asBoolean()).isTrue();
    }

    @Test void preserve_order_defaults_to_false_and_has_a_distinct_cache_identity() {
        var context = context("classic", MarketAiQuestValidator.SHELF_CATEGORY_IDS);
        var oldJson = (tools.jackson.databind.node.ObjectNode)mapper.valueToTree(context);
        oldJson.remove("preserveShelfOrder");
        var oldBody = mapper.treeToValue(oldJson, MarketAiQuestRequest.EnvironmentContext.class);
        assertThat(oldBody.preserveShelfOrder()).isFalse();
        assertThat(oldBody).isEqualTo(context);
        var preserved = new MarketAiQuestRequest.EnvironmentContext(context.layoutId(), context.shelfSlots(), context.world(), context.spawn(), true);
        var harness = new Harness();
        var keys = new ArrayList<String>();
        when(harness.audit.findReusable(eq(harness.member), anyString())).thenAnswer(call -> {
            keys.add(call.getArgument(1)); return Optional.empty();
        });
        harness.service.generate(harness.member, oldBody);
        harness.service.generate(harness.member, context);
        harness.service.generate(harness.member, preserved);
        assertThat(keys.get(0)).isEqualTo(keys.get(1));
        assertThat(keys.get(2)).isNotEqualTo(keys.get(0));
    }

    @Test void quest_history_uses_shared_encoding_without_losing_source_values_or_current_manual_request() {
        var factory = new MarketAiQuestPromptFactory(mapper);
        var history = mapper.createArrayNode();
        var geometry = mapper.createObjectNode().put("raw", "실제 지도 값".repeat(40));
        for (int i = 0; i < 2; i++) {
            var row = history.addObject().put("playOrder", i + 1);
            row.putObject("recordedPractice").putObject("sourceMovementContext").set("recordedGeometry", geometry.deepCopy());
        }
        var context = context("classic", MarketAiQuestValidator.SHELF_CATEGORY_IDS);
        var preserved = new MarketAiQuestRequest.EnvironmentContext(context.layoutId(), context.shelfSlots(), context.world(), context.spawn(), true);
        var wire = mapper.readTree(factory.withPracticeHistory(factory.withEnvironmentContext("{}", preserved), history));
        assertThat(wire.has("historySourceEncodingVersion")).isTrue();
        assertThat(oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding.decodeHistory(mapper, wire)).isEqualTo(history);
        assertThat(wire.path("currentEnvironmentContext")).isEqualTo(mapper.valueToTree(preserved));
    }

    @Test void quest_history_keeps_original_tasks_all_submissions_and_last_recorded_details_of_final_cart_only() {
        var history = mapper.createArrayNode();
        var row = history.addObject().put("playOrder", 1).put("priorAiJudgment", "SUCCESS");
        var practice = row.putObject("recordedPractice");
        var tasks = practice.putArray("tasks");
        tasks.addObject().putObject("mission").putArray("briefing").add("우유 900mL 1개를 골라요.");
        var context = practice.putObject("sourceMovementContext").put("scopeVersion", "navigation-layout-history-v1");
        context.putObject("recordedGeometry").put("layoutId", "corner");
        practice.putArray("recordedInstructionEvents").addObject().put("eventCode", "SHOP.BRIEFING_ADVANCED");
        var events = practice.putArray("purchaseEvents");
        events.addObject().put("eventCode", "SHOP.QUANTITY_CHANGED").put("sequence", 1)
                .putObject("selectedProduct").put("id", "milk").put("detail", "900mL").put("salesUnit", "개");
        var first = events.addObject().put("eventCode", "SHOP.CHECKOUT_SUBMITTED").put("sequence", 2);
        first.putObject("cart").put("milk", 1);
        events.addObject().put("eventCode", "SHOP.QUANTITY_CHANGED").put("sequence", 3)
                .putObject("selectedProduct").put("id", "apple").put("detail", "1개");
        events.addObject().put("eventCode", "SHOP.QUANTITY_CHANGED").put("sequence", 4)
                .putObject("selectedProduct").put("id", "milk").put("detail", "기록된 200mL").put("salesUnit", "팩");
        var last = events.addObject().put("eventCode", "SHOP.CHECKOUT_SUBMITTED").put("sequence", 5);
        last.putObject("cart").put("milk", 2).put("unrecorded-sku", 1);
        events.addObject().put("eventCode", "SHOP.QUANTITY_CHANGED").put("sequence", 6)
                .putObject("selectedProduct").put("id", "milk").put("detail", "제출 후의 표시");
        var wire = mapper.readTree(new MarketAiQuestPromptFactory(mapper).withPracticeHistory("{}", history));
        var selected = oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding.decodeHistory(mapper, wire).get(0).path("recordedPractice");
        assertThat(selected.path("tasks")).isEqualTo(tasks);
        assertThat(selected.path("sourceMovementContext")).isEqualTo(context);
        assertThat(selected.path("purchaseEvents")).isEqualTo(mapper.valueToTree(List.of(first, last)));
        assertThat(selected.has("recordedInstructionEvents")).isFalse();
        assertThat(selected.path("submittedProductDetails").size()).isEqualTo(1);
        assertThat(selected.path("submittedProductDetails").get(0).path("product").path("detail").asString()).isEqualTo("기록된 200mL");
        assertThat(selected.path("submittedProductDetails").get(0).path("sequence").asInt()).isEqualTo(4);
        assertThat(events.size()).isEqualTo(6);
        assertThat(practice.has("recordedInstructionEvents")).isTrue();
        assertThat(wire.path("practiceHistoryScope").asString()).contains("중간", "현재 카탈로그로 채우지 않는다");
    }

    @Test void legacy_history_without_purchase_events_does_not_gain_fabricated_empty_submissions() {
        var history = mapper.createArrayNode();
        history.addObject().putObject("recordedPractice").putObject("submittedCart").put("milk", 1);
        assertThat(QuestPracticeHistoryContext.project(mapper, history)).isEqualTo(history);
    }

    private MarketAiQuestDraft.EnvironmentPlan plan() {
        return new MarketAiQuestDraft.EnvironmentPlan(MarketAiQuestValidator.SHELF_CATEGORY_IDS, "규격 비교에 집중하도록 상품군 배정을 유지해요.");
    }

    private MarketAiQuestDraft draft(MarketAiQuestDraft.EnvironmentPlan plan) {
        return new MarketAiQuestDraft(2, "CUSTOM", "규격 연습", "우유와 사과를 담아요.", 4000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1), new MarketAiQuestDraft.Objective("apple", 1)),
                List.of("흰 우유 900mL 1개와 사과 1개를 골라요."), List.of("계산할 수 있어요.", "계속 장볼 수 있어요."),
                "연습을 마쳤어요.", "상품 규격 비교 관찰을 위한 연습", List.of("PRACTICE"), plan, 300);
    }

    private MarketAiQuestDraft withSummary(MarketAiQuestDraft draft, String summary) {
        return new MarketAiQuestDraft(draft.difficulty(), draft.scenarioId(), draft.title(), draft.description(), draft.budget(),
                draft.objectives(), draft.briefing(), draft.checkoutDialogue(), draft.successMessage(), summary, draft.reasonCodes(), draft.environmentPlan(), draft.timeLimitSeconds());
    }

    private MarketAiQuestResponse response(MarketAiQuestDraft draft, String version) {
        return MarketAiQuestResponse.from(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "AI", "test", 0, "AI_PROFILE", version, draft);
    }

    private MarketDifficultyRecommendationResponse recommendation(UUID profile) {
        return new MarketDifficultyRecommendationResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), profile, 1,
                "MARKET_SIMULATION", 2, "AI_PROFILE", new MarketDifficultyRecommendationResponse.Adjustments(2, "LOW", "LOW", "STANDARD"),
                List.of("PRACTICE"), "test", Instant.now());
    }

    private MarketAiQuestRequest.EnvironmentContext context(String layout, List<String> categories) {
        var slots = new ArrayList<MarketAiQuestRequest.ShelfSlot>();
        for (int i = 0; i < 5; i++) slots.add(new MarketAiQuestRequest.ShelfSlot(MarketAiQuestValidator.SHELF_SLOT_IDS.get(i),
                categories.get(i), 100.0 + i * 100, 200.0 + i * 50, i < 2 ? "horizontal" : "vertical"));
        return new MarketAiQuestRequest.EnvironmentContext(layout, slots, new MarketAiQuestRequest.World(1280.0, 1400.0), new MarketAiQuestRequest.Point(700.0, 1200.0));
    }

    private GroqChatClient.GroqChatResult output(MarketAiQuestDraft draft) {
        return new GroqChatClient.GroqChatResult(mapper.writeValueAsString(draft), "test");
    }

    private class Harness {
        final UUID member = UUID.randomUUID();
        final GroqChatClient client = mock(GroqChatClient.class);
        final MarketAiQuestAuditService audit = mock(MarketAiQuestAuditService.class);
        final MarketDifficultyRecommendationService recommendations = mock(MarketDifficultyRecommendationService.class);
        final MarketAiQuestService service;
        Harness() {
            var profileId = UUID.randomUUID();
            when(recommendations.recommend(member)).thenReturn(recommendation(profileId));
            var profile = mock(AiUserProfileResponse.class);
            when(profile.profileId()).thenReturn(profileId);
            when(profile.asAnalysisResponse()).thenReturn(mock(AiBehaviorAnalysisResponse.class));
            var profiles = mock(AiUserProfileService.class);
            when(profiles.find(member, profileId)).thenReturn(profile);
            var prompts = spy(new MarketAiQuestPromptFactory(mapper));
            when(prompts.systemPrompt()).thenReturn("system");
            doReturn("{}").when(prompts).userPrompt(any(), any());
            when(client.complete(anyString(), anyString(), eq(1200), eq(0.2))).thenReturn(output(draft(plan())));
            when(client.complete(anyString(), anyString(), eq(MarketAiQuestService.REVIEW_MAX_TOKENS), eq(0.0)))
                    .thenAnswer(call -> MarketQuestReviewFixtures.valid(mapper, call.getArgument(1)));
            service = new MarketAiQuestService(prompts, validator, recommendations, audit, profiles, client, mapper, mock(PracticeHistoryService.class));
        }
    }
}
