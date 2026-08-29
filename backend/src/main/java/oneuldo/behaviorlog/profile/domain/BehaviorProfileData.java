package oneuldo.behaviorlog.profile.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.IndependenceLevel;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;

public record BehaviorProfileData(
        String profileVersion,
        String profilePolicyVersion,
        String normalizerVersion,
        String registryVersion,
        String measurementRuleVersion,
        Map<String, SkillPerformanceProfile> skills,
        SupportProfile supportProfile,
        List<TrainingSessionObservation> trainingObservations,
        SafetyProfile safetyProfile,
        ValidityProfile validityProfile,
        BehaviorPatternProfile behaviorPatternProfile,
        Set<String> needsMoreAssessment,
        List<EvidenceGap> evidenceGaps,
        Instant evidenceFrom,
        Instant evidenceTo,
        Instant generatedAt
) {
    public enum ConfidenceLevel {
        INSUFFICIENT,
        LOW,
        MEDIUM,
        HIGH
    }

    public enum EvidenceGapType {
        NO_ASSESSMENT_EVIDENCE,
        INSUFFICIENT_EVIDENCE,
        SINGLE_TASK_ONLY,
        SINGLE_SESSION_ONLY,
        CONFLICTING_RESULTS,
        HIGH_EXCLUSION_RATE,
        SESSION_INTEGRITY_PROBLEM
    }

    public record ObservedEvidenceSummary(
            String eventCode,
            ObservedOutcome outcome,
            IndependenceLevel independenceLevel,
            ErrorType errorType,
            int observationCount
    ) {}

    public record SkillPerformanceProfile(
            String skillCode,
            Double independentSuccessRate,
            Double supportedSuccessRate,
            int independentEvaluableEvidenceCount,
            int supportedEvaluableEvidenceCount,
            int neutralEvidenceCount,
            int primaryEvidenceCount,
            int secondaryEvidenceCount,
            int distinctTaskCount,
            int distinctBehaviorDomainCount,
            int distinctSessionCount,
            ConfidenceLevel confidence,
            List<ObservedEvidenceSummary> observedStrengths,
            List<ObservedEvidenceSummary> observedDifficulties,
            List<String> interpretationLimits
    ) {}

    public record SupportLevelObservation(
            IndependenceLevel independenceLevel,
            int evaluableEvidenceCount,
            Double successRate
    ) {}

    public record SupportProfile(
            List<SupportLevelObservation> levelObservations,
            Double averagePromptLevel,
            Integer totalSupportCount,
            Long medianHelpRequestLatencyMs,
            int supportedSessionCount
    ) {}

    public record TrainingSessionObservation(
            UUID sessionId,
            UUID taskId,
            String taskVersion,
            Integer difficulty,
            String scenarioVariant,
            Instant startedAt,
            Instant endedAt,
            int evaluableEvidenceCount,
            Double successRate,
            Integer supportCount,
            Double averagePromptLevel
    ) {}

    public record SafetyProfile(
            SafetyStatus overallStatus,
            int redEventCount,
            int yellowEventCount,
            int nearMissCount,
            List<String> repeatedSafetyEventCodes,
            boolean professionalReviewRecommended
    ) {}

    public record ValidityProfile(
            int validEventCount,
            int invalidEventCount,
            int quarantinedEventCount,
            Map<ValidityStatus, Integer> validityStatusCounts,
            Map<String, Integer> normalizationIssueCounts,
            int openSessionCount,
            int gappedSessionCount,
            Double excludedEventRate
    ) {}

    public record BehaviorPatternProfile(
            Double selfCorrectionRate,
            Double repeatedErrorRate,
            int helpRequestCount,
            Long medianHelpRequestLatencyMs,
            Long medianStartLatencyMs,
            Map<String, Double> averagePathEfficiencyByTaskVersion
    ) {}

    public record EvidenceGap(
            String skillCode,
            EvidenceGapType type,
            String reason,
            String recommendedEvidence
    ) {}
}
