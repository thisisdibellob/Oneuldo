package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;

class LocalModelBudgetTest {
    @Test void acceptsKnownLocalAliasButRejectsUnverifiedTokenizerModels() {
        var budget = new AnalysisTokenBudget();
        int cloud = budget.total("system", "한국어 입력", 900);
        ReflectionTestUtils.setField(budget, "model", "qwen3.6:27b-q4_K_M");
        assertThat(budget.total("system", "한국어 입력", 900)).isEqualTo(cloud);
        ReflectionTestUtils.setField(budget, "model", "some-other-model");
        assertThatThrownBy(() -> budget.total("system", "input"))
                .hasMessage("TOKENIZER_MODEL_MISMATCH");
    }
}
