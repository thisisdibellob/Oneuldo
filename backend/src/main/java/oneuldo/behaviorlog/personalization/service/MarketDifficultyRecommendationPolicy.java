package oneuldo.behaviorlog.personalization.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import oneuldo.behaviorlog.personalization.domain.MarketPersonalizationDecision;
import org.springframework.stereotype.Component;

@Component
public class MarketDifficultyRecommendationPolicy {

    public static final String POLICY_VERSION = "market-personalization-v1";
    public static final List<String> TARGET_SKILLS = List.of(
            "LANGUAGE_COMPREHENSION", "NUMERACY", "MONEY_MANAGEMENT", "EXECUTIVE_FUNCTION");

    public MarketPersonalizationDecision evaluate(Map<String, MarketSkillSignal> signals,
            boolean profileAvailable) {
        List<String> reasons = new ArrayList<>();
        if (!profileAvailable) {
            return baseline("NO_PROFILE", List.of("PROFILE_NOT_AVAILABLE"));
        }

        TARGET_SKILLS.stream().filter(skill -> !usable(signals, skill))
                .forEach(skill -> reasons.add(skill + "_EVIDENCE_INSUFFICIENT"));
        List<MarketSkillSignal> usable = TARGET_SKILLS.stream()
                .map(signals::get).filter(signal -> signal != null && signal.usable()).toList();
        if (usable.isEmpty()) {
            reasons.addFirst("MINIMUM_EVIDENCE_NOT_MET");
            return baseline("INSUFFICIENT_EVIDENCE", reasons);
        }

        boolean lower = usable.stream().anyMatch(signal -> signal.independentSuccessRate() < 50.0);
        boolean promote = usable.size() == TARGET_SKILLS.size()
                && usable.stream().allMatch(signal -> signal.independentSuccessRate() >= 80.0);
        int difficulty = lower ? 1 : promote ? 3 : 2;
        reasons.add(lower ? "WEAK_SKILL_DETECTED"
                : promote ? "ALL_TARGET_SKILLS_STABLE" : "CURRENT_LEVEL_MAINTAINED");

        boolean languageWeak = weak(signals, "LANGUAGE_COMPREHENSION");
        boolean executiveWeak = weak(signals, "EXECUTIVE_FUNCTION");
        boolean languageStrong = strong(signals, "LANGUAGE_COMPREHENSION");
        boolean executiveStrong = strong(signals, "EXECUTIVE_FUNCTION");
        return new MarketPersonalizationDecision(
                difficulty,
                "BEHAVIOR_INFORMED",
                languageWeak || executiveWeak ? 2 : languageStrong && executiveStrong ? 4 : 3,
                level(signals, "NUMERACY"),
                level(signals, "MONEY_MANAGEMENT"),
                languageWeak ? "SIMPLIFIED" : languageStrong ? "REDUCED" : "STANDARD",
                reasons
        );
    }

    private MarketPersonalizationDecision baseline(String mode, List<String> reasons) {
        return new MarketPersonalizationDecision(
                2, mode, 3, "MEDIUM", "MEDIUM", "STANDARD", reasons);
    }

    private boolean usable(Map<String, MarketSkillSignal> signals, String skill) {
        MarketSkillSignal signal = signals.get(skill);
        return signal != null && signal.usable();
    }

    private boolean weak(Map<String, MarketSkillSignal> signals, String skill) {
        MarketSkillSignal signal = signals.get(skill);
        return signal != null && signal.usable() && signal.independentSuccessRate() < 50.0;
    }

    private boolean strong(Map<String, MarketSkillSignal> signals, String skill) {
        MarketSkillSignal signal = signals.get(skill);
        return signal != null && signal.usable() && signal.independentSuccessRate() >= 80.0;
    }

    private String level(Map<String, MarketSkillSignal> signals, String skill) {
        if (weak(signals, skill)) return "LOW";
        if (strong(signals, skill)) return "HIGH";
        return "MEDIUM";
    }
}
