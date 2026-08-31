package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import org.junit.jupiter.api.Test;

class MarketDifficultyRecommendationPolicyTest {

    private final MarketDifficultyRecommendationPolicy policy =
            new MarketDifficultyRecommendationPolicy();

    @Test
    void 프로파일이_없으면_기본_난이도를_사용한다() {
        var decision = policy.evaluate(Map.of(), false);

        assertThat(decision.recommendedDifficulty()).isEqualTo(2);
        assertThat(decision.personalizationMode()).isEqualTo("NO_PROFILE");
        assertThat(decision.itemCount()).isEqualTo(3);
        assertThat(decision.reasonCodes()).containsExactly("PROFILE_NOT_AVAILABLE");
    }

    @Test
    void 사용_가능한_수리_근거가_약하면_난이도와_수량_복잡도를_낮춘다() {
        var decision = policy.evaluate(Map.of(
                "NUMERACY", usable(40.0)
        ), true);

        assertThat(decision.recommendedDifficulty()).isEqualTo(1);
        assertThat(decision.personalizationMode()).isEqualTo("BEHAVIOR_INFORMED");
        assertThat(decision.quantityComplexity()).isEqualTo("LOW");
        assertThat(decision.reasonCodes()).contains("WEAK_SKILL_DETECTED");
    }

    @Test
    void 네_능력의_근거가_모두_안정적이면_난이도와_복잡도를_높인다() {
        var decision = policy.evaluate(Map.of(
                "LANGUAGE_COMPREHENSION", usable(85.0),
                "NUMERACY", usable(90.0),
                "MONEY_MANAGEMENT", usable(80.0),
                "EXECUTIVE_FUNCTION", usable(95.0)
        ), true);

        assertThat(decision.recommendedDifficulty()).isEqualTo(3);
        assertThat(decision.itemCount()).isEqualTo(4);
        assertThat(decision.quantityComplexity()).isEqualTo("HIGH");
        assertThat(decision.budgetPressure()).isEqualTo("HIGH");
        assertThat(decision.textSupport()).isEqualTo("REDUCED");
        assertThat(decision.reasonCodes()).containsExactly("ALL_TARGET_SKILLS_STABLE");
    }

    @Test
    void 근거_수가_기준보다_적으면_점수가_높아도_난이도를_바꾸지_않는다() {
        var decision = policy.evaluate(Map.of(
                "NUMERACY", new MarketSkillSignal(100.0, 4, 2, ConfidenceLevel.MEDIUM)
        ), true);

        assertThat(decision.recommendedDifficulty()).isEqualTo(2);
        assertThat(decision.personalizationMode()).isEqualTo("INSUFFICIENT_EVIDENCE");
        assertThat(decision.reasonCodes()).contains("MINIMUM_EVIDENCE_NOT_MET");
    }

    private MarketSkillSignal usable(double successRate) {
        return new MarketSkillSignal(successRate, 5, 2, ConfidenceLevel.MEDIUM);
    }
}
