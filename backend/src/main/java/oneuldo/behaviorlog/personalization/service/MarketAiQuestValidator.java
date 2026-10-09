package oneuldo.behaviorlog.personalization.service;

import java.util.HashSet;
import java.util.ArrayList;
import java.util.Map;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.springframework.stereotype.Component;

@Component
public class MarketAiQuestValidator {

    public MarketAiQuestDraft validate(MarketAiQuestDraft draft) {
        if (draft == null) throw invalid("빈 결과");
        if (draft.difficulty() < 1 || draft.difficulty() > 3) throw invalid("난이도");
        if (draft.scenarioId() == null) throw invalid("시나리오 ID");
        text(draft.title(), 40, "제목");
        text(draft.description(), 120, "설명");
        text(draft.successMessage(), 80, "성공 문장");
        text(draft.adaptationSummary(), 120, "조정 요약");
        if (draft.objectives() == null || draft.objectives().size() < 1
                || draft.objectives().size() > 4) throw invalid("목표 개수");
        var productIds = new HashSet<String>();
        int total = 0;
        var lineItems = new ArrayList<Map<String, Object>>();
        for (var objective : draft.objectives()) {
            if (objective == null || !productIds.add(objective.productId())) {
                throw invalid("중복 상품");
            }
            if (MarketQuestCatalog.PRODUCTS.stream().noneMatch(p -> p.id().equals(objective.productId()))) {
                throw new MarketQuestValidationException("상품 ID", Map.of(
                        "code", "UNKNOWN_PRODUCT_ID", "path", "/objectives/" + lineItems.size() + "/productId",
                        "allowedProductIds", MarketQuestCatalog.PRODUCTS.stream().map(MarketQuestCatalog.Product::id).toList()));
            }
            var product = MarketQuestCatalog.require(objective.productId());
            if (objective.quantity() < 1 || objective.quantity() > 3) throw invalid("수량");
            int subtotal = product.price() * objective.quantity();
            total += subtotal;
            lineItems.add(Map.of("productId", product.id(), "unitPrice", product.price(),
                    "quantity", objective.quantity(), "subtotal", subtotal));
        }
        if (draft.budget() < total || draft.budget() > total + 4000) {
            boolean custom = "CUSTOM".equals(draft.scenarioId());
            int minimum = custom ? total : MarketQuestCatalog.requireScenario(draft.scenarioId()).budget();
            int maximum = custom ? total + 4000 : minimum;
            throw new MarketQuestValidationException("예산", Map.of(
                    "code", "BUDGET_OUT_OF_RANGE", "submittedBudget", draft.budget(),
                    "objectiveTotal", total, "minimumBudget", minimum, "maximumBudget", maximum,
                    "lineItems", lineItems));
        }
        if (!"CUSTOM".equals(draft.scenarioId())) {
            var scenario = MarketQuestCatalog.requireScenario(draft.scenarioId());
            if (draft.budget() != scenario.budget() || draft.objectives().size() != scenario.objectives().size()) {
                throw new MarketQuestValidationException("시나리오 콘텐츠 계약", Map.of(
                        "code", "FIXED_SCENARIO_CONTRACT", "scenarioId", scenario.id(),
                        "requiredBudget", scenario.budget(), "requiredObjectives", scenario.objectives()));
            }
            for (var objective : scenario.objectives()) {
                if (draft.objectives().stream().noneMatch(o -> o.productId().equals(objective.productId())
                        && o.quantity() == objective.quantity())) throw invalid("시나리오 목표");
            }
        }
        sentences(draft.briefing(), 1, 3, "안내");
        sentences(draft.checkoutDialogue(), 2, 2, "계산대 대화");
        if (draft.reasonCodes() == null || draft.reasonCodes().isEmpty()
                || draft.reasonCodes().size() > 8) throw invalid("사유 코드");
        draft.reasonCodes().forEach(code -> {
            if (code == null || !code.matches("[A-Z0-9_]{2,50}")) throw invalid("사유 코드 형식");
        });
        return draft;
    }

    public MarketAiQuestDraft validate(MarketAiQuestDraft draft, int expectedDifficulty) {
        MarketAiQuestDraft validated = validate(draft);
        if (validated.difficulty() != expectedDifficulty) {
            throw invalid("AI 추천 난이도 불일치");
        }
        return validated;
    }

    private void sentences(java.util.List<String> values, int min, int max, String field) {
        if (values == null || values.size() < min || values.size() > max) throw invalid(field);
        values.forEach(value -> text(value, 80, field));
    }

    private void text(String value, int maxLength, String field) {
        if (value == null || value.isBlank() || value.length() > maxLength) throw invalid(field);
    }

    private IllegalArgumentException invalid(String field) {
        return new IllegalArgumentException("AI 장보기 퀘스트 검증 실패: " + field);
    }
}
