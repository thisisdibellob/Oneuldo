package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import static org.assertj.core.api.Assertions.*;

class AnalysisTokenBudgetTest {
    @Test void output_stays_below_observed_provider_cap_and_is_reserved() {
        var budget = new AnalysisTokenBudget();
        assertThat(budget.chunkOutputTokens()).isEqualTo(900);
        assertThat(budget.finalOutputTokens()).isEqualTo(900);
        assertThat(budget.requestTokens()).isEqualTo(7000);
        assertThat(budget.total("system", "input"))
                .isEqualTo(budget.total("system", "input", 900));
        assertThatThrownBy(() -> budget.requireFits("system", "input", 1800, 1800, "TOO_LARGE"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("TOO_LARGE");
    }
}
