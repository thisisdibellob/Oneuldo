package oneuldo.behaviorlog.personalization.service;

import java.util.HashSet;
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
        if (draft.objectives() == null || draft.objectives().size() < 2
                || draft.objectives().size() > 4) throw invalid("목표 개수");
        var productIds = new HashSet<String>();
        int total = 0;
        for (var objective : draft.objectives()) {
            if (objective == null || !productIds.add(objective.productId())) {
                throw invalid("중복 상품");
            }
            var product = MarketQuestCatalog.require(objective.productId());
            if (objective.quantity() < 1 || objective.quantity() > 3) throw invalid("수량");
            total += product.price() * objective.quantity();
        }
        if (draft.budget() < total || draft.budget() > total + 4000) throw invalid("예산");
        if (!"CUSTOM".equals(draft.scenarioId())) {
            var scenario = MarketQuestCatalog.requireScenario(draft.scenarioId());
            if (draft.budget() != scenario.budget() || draft.objectives().size() != scenario.objectives().size()) {
                throw invalid("시나리오 콘텐츠 계약");
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
