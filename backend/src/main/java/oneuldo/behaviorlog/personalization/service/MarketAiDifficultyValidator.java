package oneuldo.behaviorlog.personalization.service;

import java.util.Set;
import oneuldo.behaviorlog.personalization.domain.MarketAiDifficultyDraft;
import org.springframework.stereotype.Component;

@Component
public class MarketAiDifficultyValidator {

    private static final Set<String> COMPLEXITY = Set.of("LOW", "MEDIUM", "HIGH");
    private static final Set<String> TEXT_SUPPORT = Set.of("SIMPLIFIED", "STANDARD", "REDUCED");

    public MarketAiDifficultyDraft validate(MarketAiDifficultyDraft draft) {
        if (draft == null) throw invalid("빈 결과");
        if (draft.recommendedDifficulty() < 1 || draft.recommendedDifficulty() > 3) {
            throw invalid("추천 난이도");
        }
        if (draft.itemCount() < 1 || draft.itemCount() > 4) throw invalid("품목 수");
        if (!COMPLEXITY.contains(draft.quantityComplexity())) throw invalid("수량 복잡도");
        if (!COMPLEXITY.contains(draft.budgetPressure())) throw invalid("예산 압박");
        if (!TEXT_SUPPORT.contains(draft.textSupport())) throw invalid("문장 지원");
        if (draft.reasonCodes().isEmpty() || draft.reasonCodes().size() > 8) {
            throw invalid("사유 코드");
        }
        draft.reasonCodes().forEach(code -> {
            if (code == null || !code.matches("[A-Z0-9_]{2,50}")) {
                throw invalid("사유 코드 형식");
            }
        });
        return draft;
    }

    private IllegalArgumentException invalid(String field) {
        return new IllegalArgumentException("AI 장보기 난이도 검증 실패: " + field);
    }
}
