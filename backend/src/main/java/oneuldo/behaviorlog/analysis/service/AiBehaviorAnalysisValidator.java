package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.personalization.domain.MarketAiDifficultyDraft;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.springframework.stereotype.Component;

/** 구조·참조·게임 실행 범위만 검사한다. 사용자 성공/실패는 계산하지 않는다. */
@Component
public class AiBehaviorAnalysisValidator {
    private final MarketAiDifficultyValidator difficultyValidator;
    public AiBehaviorAnalysisValidator(MarketAiDifficultyValidator difficultyValidator) {
        this.difficultyValidator = difficultyValidator;
    }

    public AiBehaviorAnalysis validate(AiBehaviorAnalysis result, BehaviorAnalysisInputResponse input) {
        require(result != null);
        text(result.summary());
        require(result.findings() != null && result.findings().size() <= 12);
        require(result.uncertainties() != null && result.uncertainties().size() <= 20);
        result.uncertainties().forEach(this::text);
        Map<UUID, Set<UUID>> sessions = new HashMap<>();
        Set<UUID> events = new HashSet<>();
        input.input().sessions().forEach(session -> {
            Set<UUID> ids = new HashSet<>();
            session.events().forEach(event -> ids.add(event.behaviorLogId()));
            sessions.put(session.sessionId(), ids); events.addAll(ids);
        });
        Set<String> findingIds = new HashSet<>();
        for (var finding : result.findings()) {
            require(finding != null);
            text(finding.id()); require(findingIds.add(finding.id()));
            text(finding.skill()); text(finding.observation()); text(finding.interpretation());
            text(finding.suggestedSupport());
            require(finding.alternativeExplanations() != null
                    && finding.alternativeExplanations().size() <= 8);
            finding.alternativeExplanations().forEach(this::text);
            evidence(finding.evidenceEventIds(), events);
        }
        require(result.sessionAssessments() != null && result.sessionAssessments().size() == sessions.size());
        Set<UUID> assessed = new HashSet<>();
        for (var assessment : result.sessionAssessments()) {
            require(assessment != null && sessions.containsKey(assessment.sessionId()) && assessed.add(assessment.sessionId()));
            require(assessment.judgment() != null && Set.of("SUCCESS", "FAILURE", "UNDETERMINED").contains(assessment.judgment()));
            text(assessment.explanation());
            evidence(assessment.evidenceEventIds(), sessions.get(assessment.sessionId()));
        }
        var plan = result.practicePlan(); require(plan != null);
        require(plan.targetFindingIds() != null && findingIds.containsAll(plan.targetFindingIds()));
        require(!findingIds.isEmpty() ? !plan.targetFindingIds().isEmpty() : !result.uncertainties().isEmpty());
        text(plan.goal()); text(plan.rationale());
        require(plan.reasonCodes() != null && plan.quantityComplexity() != null
                && plan.budgetPressure() != null && plan.textSupport() != null);
        difficultyValidator.validate(new MarketAiDifficultyDraft(plan.recommendedDifficulty(), plan.itemCount(),
                plan.quantityComplexity(), plan.budgetPressure(), plan.textSupport(), plan.reasonCodes()));
        EvidenceIndex.validateCitations(result.usedEvidenceCardIds(), input.eventCount() > 0 ? "interface" : "");
        return result;
    }
    public oneuldo.behaviorlog.analysis.domain.AiObservationDigest validateDigest(
            oneuldo.behaviorlog.analysis.domain.AiObservationDigest digest, BehaviorAnalysisInputResponse input) {
        require(digest != null); text(digest.summary());
        require(digest.observations() != null && digest.observations().size() <= 6);
        require(digest.uncertainties() != null && digest.uncertainties().size() <= 12);
        digest.uncertainties().forEach(this::text);
        require(!digest.observations().isEmpty() || !digest.uncertainties().isEmpty());
        Set<UUID> allowed = new HashSet<>();
        input.input().sessions().forEach(s -> s.events().forEach(e -> allowed.add(e.behaviorLogId())));
        for (int index = 0; index < digest.observations().size(); index++) {
            var observation = digest.observations().get(index);
            require(observation != null); text(observation.observation()); text(observation.interpretation());
            require(observation.alternativeExplanations() != null
                    && observation.alternativeExplanations().size() <= 8);
            observation.alternativeExplanations().forEach(this::text);
            var ids = observation.evidenceEventIds();
            require(ids != null && !ids.isEmpty() && ids.size() <= 30);
            var outside = ids.stream().filter(id -> !allowed.contains(id)).map(String::valueOf).toList();
            if (!outside.isEmpty()) throw new ReviewEvidenceException("DIGEST_EVIDENCE_OUTSIDE_CHUNK",
                    "observations[" + index + "].evidenceEventIds", outside);
        }
        return digest;
    }

    public oneuldo.behaviorlog.analysis.domain.AiObservationDigest validateReduction(
            oneuldo.behaviorlog.analysis.domain.AiObservationDigest digest, BehaviorAnalysisInputResponse input,
            List<oneuldo.behaviorlog.analysis.domain.AiObservationDigest> children) {
        validateDigest(digest, input);
        require(!digest.uncertainties().isEmpty());
        Set<UUID> cited = new HashSet<>();
        children.forEach(child -> child.observations().forEach(o -> cited.addAll(o.evidenceEventIds())));
        for (var o : digest.observations()) {
            if(!cited.containsAll(o.evidenceEventIds())) throw new IllegalArgumentException("EVIDENCE_NOT_IN_CHILD_INTERPRETATIONS");
        }
        return digest;
    }
    private void evidence(List<UUID> ids, Set<UUID> allowed) {
        require(ids != null && !ids.isEmpty() && ids.size() <= 30 && allowed.containsAll(ids));
    }
    private void text(String value) { require(value != null && !value.isBlank() && value.length() <= 2000); }
    private void require(boolean valid) { if (!valid) throw new IllegalArgumentException("INVALID_ANALYSIS_CONTRACT"); }
}
