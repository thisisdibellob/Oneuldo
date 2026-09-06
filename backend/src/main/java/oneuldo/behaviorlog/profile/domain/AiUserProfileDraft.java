package oneuldo.behaviorlog.profile.domain;

import java.util.List;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;

/** AI-generated cumulative fields. The latest session assessment is copied from the session analysis. */
public record AiUserProfileDraft(
        String summary,
        List<AiBehaviorAnalysis.Finding> findings,
        List<String> uncertainties,
        AiBehaviorAnalysis.PracticePlan practicePlan,
        List<String> usedEvidenceCardIds
) {}
