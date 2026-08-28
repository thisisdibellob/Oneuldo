package oneuldo.simulationquest.llm.input;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.IndependenceLevel;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.EvidenceGapType;
import oneuldo.member.domain.SupportLevel;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record LlmSimulationGenerationInput(
        String schemaVersion,
        QuestContext quest,
        ContentContext content,
        PreferenceContext preferences,
        ProfileContext profile,
        GenerationPlan generationPlan
) {
    public enum PersonalizationMode {
        NO_PROFILE,
        STALE_PROFILE,
        INSUFFICIENT_EVIDENCE,
        BEHAVIOR_INFORMED
    }

    public enum InstructionGranularity {
        COMPLETE_TASK,
        ONE_STEP,
        ONE_ACTION
    }

    public record QuestContext(
            String questCode,
            String subcategoryCode,
            String title,
            String goal,
            QuestDifficulty difficulty,
            Set<String> targetSkillCodes
    ) {}

    public record ContentContext(
            SimulationType simulationType,
            String placeCode,
            String placeName,
            SimulationPayload referencePayload,
            Set<String> allowedAssetCodes
    ) {}

    public record PreferenceContext(
            QuestDifficulty preferredDifficulty,
            SupportLevel preferredSupportLevel,
            int preferredSessionMinutes,
            Set<String> preferredSubcategoryCodes
    ) {}

    public record ProfileContext(
            boolean available,
            boolean stale,
            String profileVersion,
            Instant generatedAt,
            Instant evidenceFrom,
            Instant evidenceTo,
            List<SkillSignal> selectedSkills,
            SupportSignal support,
            SafetySignal safety,
            DataQualitySignal dataQuality
    ) {}

    public record SkillSignal(
            String skillCode,
            Double independentSuccessRate,
            Double supportedSuccessRate,
            int independentEvidenceCount,
            int supportedEvidenceCount,
            ConfidenceLevel confidence,
            List<BehaviorSignal> strengths,
            List<BehaviorSignal> difficulties,
            List<EvidenceGapType> evidenceGaps
    ) {}

    public record BehaviorSignal(
            String eventCode,
            ObservedOutcome outcome,
            IndependenceLevel independenceLevel,
            ErrorType errorType,
            int observationCount
    ) {}

    public record SupportSignal(
            Double averagePromptLevel,
            Integer totalSupportCount,
            Long medianHelpRequestLatencyMs,
            int supportedSessionCount
    ) {}

    public record SafetySignal(
            SafetyStatus overallStatus,
            int redEventCount,
            int yellowEventCount,
            int nearMissCount,
            boolean professionalReviewRecommended
    ) {}

    public record DataQualitySignal(
            Double excludedEventRate,
            int openSessionCount,
            int gappedSessionCount,
            Set<String> skillsNeedingMoreAssessment
    ) {}

    public record GenerationPlan(
            PersonalizationMode personalizationMode,
            QuestDifficulty difficulty,
            Set<String> targetSkillCodes,
            SupportLevel supportLevel,
            InstructionGranularity instructionGranularity,
            int maxTaskSteps,
            int maxChoicesPerStep,
            int hintLevel,
            boolean timePressureAllowed,
            boolean hazardousDistractorsAllowed,
            boolean mandatorySafetyGuidance,
            boolean assessmentPriority,
            List<String> decisionReasons
    ) {}
}
