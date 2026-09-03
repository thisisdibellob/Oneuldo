package oneuldo.behaviorlog.analysis.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ErrorContext;
import oneuldo.behaviorlog.domain.context.PresentationContext;
import oneuldo.behaviorlog.domain.context.SafetyContext;
import oneuldo.behaviorlog.domain.context.SessionEndContext;
import oneuldo.behaviorlog.domain.context.SimulationContext;
import oneuldo.behaviorlog.domain.context.SupportContext;
import oneuldo.behaviorlog.domain.context.TaskResultContext;
import oneuldo.behaviorlog.domain.context.UserExperienceContext;
import oneuldo.behaviorlog.domain.context.ValidityContext;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.DevicePerformanceClass;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.normalization.domain.CanonicalActionType;
import oneuldo.behaviorlog.normalization.domain.MeasurementUnit;
import oneuldo.behaviorlog.normalization.domain.NormalizationFlag;
import oneuldo.behaviorlog.normalization.domain.NormalizationIssue;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.normalization.domain.ValueSemantics;

/** 해석이나 이벤트 선별 없이 모든 행동 타임라인을 AI에 전달하는 입력 계약이다. */
public record BehaviorAnalysisInput(
        String schemaVersion,
        UUID datasetId,
        Instant generatedAt,
        AnalysisWindow analysisWindow,
        String anonymousSubjectId,
        int sessionCount,
        int eventCount,
        List<SessionTimeline> sessions
) {
    public record AnalysisWindow(Instant from, Instant to) {}

    public record SessionTimeline(
            UUID sessionId,
            Instant startedAt,
            Instant endedAt,
            SessionIntegrity integrity,
            List<EventTimeline> events
    ) {}

    public record SessionIntegrity(
            SessionIntegrityStatus status,
            long highestEventSequence,
            long receivedEventCount,
            long missingEventCount,
            List<Long> missingEventSequences,
            boolean finalized,
            Instant evaluatedAt
    ) {}

    public record EventTimeline(
            UUID behaviorLogId,
            UUID normalizedEventId,
            UUID clientEventId,
            UUID batchId,
            long sequence,
            Instant occurredAt,
            Instant receivedAt,
            long elapsedFromSessionStartMs,
            String eventSchemaVersion,
            String appVersion,
            String contentVersion,
            Boolean offlineQueued,
            DevicePerformanceClass devicePerformanceClass,
            EventTask task,
            EventAction action,
            AccessibilityContext accessibility,
            PresentationContext presentation,
            TaskResultContext taskResult,
            ErrorContext error,
            SupportContext support,
            SafetyContext safety,
            ValidityContext validity,
            SimulationContext simulation,
            SessionEndContext sessionEnd,
            UserExperienceContext userExperience,
            BehaviorPayload payload,
            Normalization normalization
    ) {}

    public record EventTask(
            String gameId,
            UUID taskId,
            String taskVersion,
            Integer difficulty,
            String scenarioVariant,
            EvidenceContext evidenceContext
    ) {}

    public record EventAction(
            String eventCode,
            String microActionId,
            UUID stepId,
            StepOutcome stepOutcome,
            Integer stepOrder,
            Long startLatencyMs,
            String firstAction
    ) {}

    public record Normalization(
            String normalizerVersion,
            String registryVersion,
            String measurementRuleVersion,
            NormalizationStatus status,
            CanonicalActionType actionType,
            ObservedOutcome outcome,
            ValidityStatus validityStatus,
            Set<NormalizationFlag> flags,
            List<NormalizationIssue> issues,
            List<Measurement> measurements
    ) {}

    public record Measurement(
            String metricCode,
            BigDecimal numericValue,
            String codeValue,
            BigDecimal targetNumericValue,
            MeasurementUnit unit,
            ValueSemantics semantics
    ) {}
}
