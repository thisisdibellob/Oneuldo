package oneuldo.behaviorlog.profile.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.analysis.service.EvidenceIndex;
import oneuldo.behaviorlog.personalization.domain.MarketAiDifficultyDraft;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import oneuldo.behaviorlog.profile.domain.AiUserProfileDraft;
import org.springframework.stereotype.Component;

@Component
public class AiUserProfileValidator {
    private final MarketAiDifficultyValidator difficulty;
    public AiUserProfileValidator(MarketAiDifficultyValidator difficulty) { this.difficulty = difficulty; }

    public AiUserProfileDraft validate(AiUserProfileDraft draft, AiUserProfile previous,
            AiBehaviorAnalysisResponse current) {
        require(draft != null); text(draft.summary());
        require(draft.findings() != null && !draft.findings().isEmpty() && draft.findings().size() <= 4);
        require(draft.uncertainties() != null && !draft.uncertainties().isEmpty() && draft.uncertainties().size() <= 12);
        draft.uncertainties().forEach(this::text);
        Set<UUID> allowed = new HashSet<>();
        previous.getProfile().findings().forEach(f -> allowed.addAll(f.evidenceEventIds()));
        previous.getProfile().sessionAssessments().forEach(s -> allowed.addAll(s.evidenceEventIds()));
        current.analysis().findings().forEach(f -> allowed.addAll(f.evidenceEventIds()));
        current.analysis().sessionAssessments().forEach(s -> allowed.addAll(s.evidenceEventIds()));
        Set<String> findingIds = new HashSet<>();
        for (var finding : draft.findings()) {
            require(finding != null); text(finding.id()); require(findingIds.add(finding.id()));
            text(finding.skill()); text(finding.observation()); text(finding.interpretation()); text(finding.suggestedSupport());
            require(finding.alternativeExplanations() != null && !finding.alternativeExplanations().isEmpty()
                    && finding.alternativeExplanations().size() <= 8);
            finding.alternativeExplanations().forEach(this::text);
            require(finding.evidenceEventIds() != null && !finding.evidenceEventIds().isEmpty()
                    && finding.evidenceEventIds().size() <= 8 && allowed.containsAll(finding.evidenceEventIds()));
        }
        var plan = draft.practicePlan(); require(plan != null);
        require(plan.targetFindingIds() != null && !plan.targetFindingIds().isEmpty()
                && findingIds.containsAll(plan.targetFindingIds()));
        text(plan.goal()); text(plan.rationale());
        difficulty.validate(new MarketAiDifficultyDraft(plan.recommendedDifficulty(), plan.itemCount(),
                plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport(), plan.reasonCodes()));
        EvidenceIndex.validateCitations(draft.usedEvidenceCardIds(), "interface");
        return draft;
    }

    private void text(String value) { require(value != null && !value.isBlank() && value.length() <= 2000); }
    private void require(boolean value) { if (!value) throw new IllegalArgumentException("INVALID_USER_PROFILE_CONTRACT"); }
}
