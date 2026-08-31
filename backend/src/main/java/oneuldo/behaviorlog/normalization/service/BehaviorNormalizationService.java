package oneuldo.behaviorlog.normalization.service;

import java.lang.reflect.InvocationTargetException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.context.ErrorContext;
import oneuldo.behaviorlog.domain.context.ValidityContext;
import oneuldo.behaviorlog.domain.type.ContentSource;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InvalidReason;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.normalization.domain.EvidenceDirection;
import oneuldo.behaviorlog.normalization.domain.EvidenceRole;
import oneuldo.behaviorlog.normalization.domain.EvidenceUse;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.IndependenceLevel;
import oneuldo.behaviorlog.normalization.domain.NormalizationFlag;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.NormalizationIssue;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvidence;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorMeasurement;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventDefinition;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEvidenceRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorMeasurementRepository;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BehaviorNormalizationService {

    public static final String NORMALIZER_VERSION = "behavior-normalizer-v1";
    private static final Duration LATE_ARRIVAL_THRESHOLD = Duration.ofMinutes(5);
    private static final Duration CLOCK_SKEW_THRESHOLD = Duration.ofMinutes(5);

    private final BehaviorLogRepository behaviorLogRepository;
    private final NormalizedBehaviorEventRepository eventRepository;
    private final NormalizedBehaviorEvidenceRepository evidenceRepository;
    private final NormalizedBehaviorMeasurementRepository measurementRepository;
    private final BehaviorEventRegistry eventRegistry;
    private final BehaviorMeasurementExtractor measurementExtractor;
    private final BehaviorSessionIntegrityRepository sessionIntegrityRepository;

    public BehaviorNormalizationService(BehaviorLogRepository behaviorLogRepository,
            NormalizedBehaviorEventRepository eventRepository,
            NormalizedBehaviorEvidenceRepository evidenceRepository,
            NormalizedBehaviorMeasurementRepository measurementRepository,
            BehaviorEventRegistry eventRegistry,
            BehaviorMeasurementExtractor measurementExtractor,
            BehaviorSessionIntegrityRepository sessionIntegrityRepository) {
        this.behaviorLogRepository = behaviorLogRepository;
        this.eventRepository = eventRepository;
        this.evidenceRepository = evidenceRepository;
        this.measurementRepository = measurementRepository;
        this.eventRegistry = eventRegistry;
        this.measurementExtractor = measurementExtractor;
        this.sessionIntegrityRepository = sessionIntegrityRepository;
    }

    @Transactional
    public NormalizedBehaviorEvent normalize(UUID behaviorLogId) {
        BehaviorLog log = behaviorLogRepository.findById(behaviorLogId)
                .orElseThrow(() -> new IllegalArgumentException("행동 로그를 찾을 수 없습니다: " + behaviorLogId));
        var existing = eventRepository.findByBehaviorLogIdAndNormalizerVersion(
                behaviorLogId, NORMALIZER_VERSION);
        if (existing.isPresent()) return existing.get();
        return normalize(log);
    }

    @Transactional(readOnly = true)
    public List<UUID> findMissingIds(int batchSize) {
        return behaviorLogRepository.findIdsMissingNormalization(
                NORMALIZER_VERSION, PageRequest.of(0, batchSize));
    }

    private NormalizedBehaviorEvent normalize(BehaviorLog log) {
        BehaviorEventDefinition definition = eventRegistry.find(log.getEventCode()).orElse(null);
        List<NormalizationIssue> issues = new ArrayList<>();
        if (definition == null) {
            issues.add(new NormalizationIssue("UNKNOWN_EVENT_CODE", "action.eventCode",
                    "등록되지 않은 eventCode입니다: " + log.getEventCode()));
        }
        PayloadValidationResult payloadValidation = definition == null
                ? new PayloadValidationResult(List.of()) : validatePayload(log, definition);
        issues.addAll(payloadValidation.issues());
        boolean payloadValid = definition != null && payloadValidation.valid();
        ValidityStatus validity = definition == null
                ? ValidityStatus.UNKNOWN_EVENT_CODE
                : payloadValid ? resolveValidity(log.getValidityContext()) : ValidityStatus.INVALID_PAYLOAD;
        if (validity != ValidityStatus.VALID
                && validity != ValidityStatus.INVALID_PAYLOAD
                && validity != ValidityStatus.UNKNOWN_EVENT_CODE) {
            issues.add(new NormalizationIssue(validity.name(), "validity",
                    "원본 로그의 유효성 문맥에 따라 프로파일 근거에서 제외됩니다."));
        }
        NormalizationStatus status = definition == null || !payloadValid
                ? NormalizationStatus.QUARANTINED : NormalizationStatus.NORMALIZED;
        EvidenceUse evidenceUse = resolveEvidenceUse(log, definition, validity);
        ObservedOutcome outcome = definition == null ? null : resolveOutcome(log, definition);

        NormalizedBehaviorEvent normalized = eventRepository.save(new NormalizedBehaviorEvent(
                log,
                NORMALIZER_VERSION,
                BehaviorEventRegistry.REGISTRY_VERSION,
                BehaviorEventRegistry.MEASUREMENT_RULE_VERSION,
                sessionIntegrityRepository.findByMemberIdAndSessionId(
                        log.getMember().getId(), log.getSessionId()).orElse(null),
                status,
                definition == null ? null : definition.domain(),
                definition == null ? null : definition.actionType(),
                outcome,
                definition == null ? null : resolveErrorType(log, definition),
                definition == null ? null : resolveIndependence(log),
                evidenceUse,
                validity,
                definition == null ? null : resolveSafetyStatus(log, definition, outcome),
                resolveFlags(log, definition),
                issues,
                Instant.now()
        ));

        if (status == NormalizationStatus.NORMALIZED && evidenceUse != EvidenceUse.EXCLUDED) {
            saveEvidence(normalized, definition, outcome, evidenceUse);
        }
        if (status == NormalizationStatus.NORMALIZED) {
            saveMeasurements(normalized, log, definition);
        }
        return normalized;
    }

    private PayloadValidationResult validatePayload(BehaviorLog log, BehaviorEventDefinition definition) {
        List<NormalizationIssue> issues = new ArrayList<>();
        if (definition.requiredPayloadType() != null
                && definition.requiredPayloadType() != log.getPayloadType()) {
            issues.add(new NormalizationIssue("PAYLOAD_TYPE_MISMATCH", "payload.type",
                    "필요한 payload type은 " + definition.requiredPayloadType()
                            + "이지만 실제 값은 " + log.getPayloadType() + "입니다."));
            return new PayloadValidationResult(issues);
        }
        if (definition.requiredPayloadFields().isEmpty()) {
            return new PayloadValidationResult(issues);
        }
        if (log.getPayload() == null || !log.getPayload().getClass().isRecord()) {
            issues.add(new NormalizationIssue("MISSING_PAYLOAD", "payload",
                    "이벤트 정규화에 필요한 payload가 없습니다."));
            return new PayloadValidationResult(issues);
        }
        for (String field : definition.requiredPayloadFields()) {
            try {
                var component = java.util.Arrays.stream(log.getPayload().getClass().getRecordComponents())
                        .filter(candidate -> candidate.getName().equals(field))
                        .findFirst();
                Object value = component.isEmpty()
                        ? null : component.get().getAccessor().invoke(log.getPayload());
                if (value == null || value instanceof String text && text.isBlank()
                        || value instanceof java.util.Collection<?> collection && collection.isEmpty()) {
                    issues.add(new NormalizationIssue("MISSING_REQUIRED_FIELD", "payload." + field,
                            "필수 payload 필드가 없습니다."));
                }
            } catch (IllegalAccessException | InvocationTargetException exception) {
                issues.add(new NormalizationIssue("UNREADABLE_PAYLOAD_FIELD", "payload." + field,
                        "payload 필드를 읽을 수 없습니다."));
            }
        }
        if ("SHOP.ITEM_MISSING".equals(log.getEventCode())
                && log.getPayload() instanceof oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload payload
                && !Integer.valueOf(0).equals(payload.selectedQuantity())) {
            issues.add(new NormalizationIssue(
                    "INVALID_MISSING_ITEM_QUANTITY",
                    "payload.selectedQuantity",
                    "누락 상품의 선택 수량은 0이어야 합니다."
            ));
        }
        return new PayloadValidationResult(issues);
    }

    private ValidityStatus resolveValidity(ValidityContext validity) {
        if (validity == null) return ValidityStatus.VALID;
        if (Boolean.TRUE.equals(validity.technicalError())
                || validity.invalidReason() == InvalidReason.TECHNICAL_ERROR) {
            return ValidityStatus.INVALID_TECHNICAL;
        }
        if (Boolean.TRUE.equals(validity.assistantIntervention())
                || validity.invalidReason() == InvalidReason.ASSISTANT_INTERVENTION) {
            return ValidityStatus.INVALID_ASSISTANT_INTERVENTION;
        }
        if (validity.invalidReason() == InvalidReason.LANGUAGE_ACCESS) {
            return ValidityStatus.INVALID_LANGUAGE_ACCESS;
        }
        if (validity.invalidReason() == InvalidReason.CONTROLLER_ERROR
                || validity.invalidReason() == InvalidReason.SENSORY_ACCESS) {
            return ValidityStatus.INVALID_ACCESSIBILITY;
        }
        if (validity.invalidReason() == InvalidReason.OTHER) {
            return ValidityStatus.REVIEW_REQUIRED;
        }
        return ValidityStatus.VALID;
    }

    private EvidenceUse resolveEvidenceUse(BehaviorLog log, BehaviorEventDefinition definition,
            ValidityStatus validity) {
        if (definition == null || validity != ValidityStatus.VALID) return EvidenceUse.EXCLUDED;
        if (definition.safetyRelevant()) return EvidenceUse.SAFETY_ONLY;
        EvidenceContext context = log.getEvidenceContext();
        return switch (context) {
            case ASSESSMENT_TASK -> EvidenceUse.ASSESSMENT_PRIMARY;
            case TRAINING_TASK -> EvidenceUse.TRAINING_PROGRESS;
            case PASSIVE_PLAY -> EvidenceUse.CONTEXT_ONLY;
            case ACCESSIBILITY -> EvidenceUse.ACCESSIBILITY_ONLY;
        };
    }

    private ObservedOutcome resolveOutcome(BehaviorLog log, BehaviorEventDefinition definition) {
        if (definition.defaultOutcome() != null) return definition.defaultOutcome();
        StepOutcome raw = log.getStepOutcome();
        if (raw == null) return ObservedOutcome.NEUTRAL;
        return ObservedOutcome.valueOf(raw.name());
    }

    private ErrorType resolveErrorType(BehaviorLog log, BehaviorEventDefinition definition) {
        if ("SHOP.QUANTITY_CHANGED".equals(log.getEventCode())
                && log.getPayload() instanceof oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload payload) {
            return Objects.equals(payload.requiredQuantity(), payload.selectedQuantity())
                    ? ErrorType.NONE : ErrorType.QUANTITY_ERROR;
        }
        ErrorContext error = log.getErrorContext();
        if (error == null) return definition.defaultErrorType();
        if (positive(error.sequenceErrorCount())) return ErrorType.SEQUENCE_ERROR;
        if (positive(error.wrongActionCount())) return ErrorType.WRONG_SELECTION;
        if (positive(error.omissionCount())) return ErrorType.OMISSION;
        if (positive(error.repetitionCount())) return ErrorType.REPETITION;
        return definition.defaultErrorType();
    }

    private IndependenceLevel resolveIndependence(BehaviorLog log) {
        if (log.getValidityContext() != null
                && Boolean.TRUE.equals(log.getValidityContext().assistantIntervention())) {
            return IndependenceLevel.ASSISTED;
        }
        if (log.getSupportContext() == null || log.getSupportContext().promptLevel() == null) {
            return IndependenceLevel.INDEPENDENT;
        }
        return switch (log.getSupportContext().promptLevel()) {
            case 0 -> IndependenceLevel.INDEPENDENT;
            case 1 -> IndependenceLevel.SUPPORTED_LEVEL_1;
            case 2 -> IndependenceLevel.SUPPORTED_LEVEL_2;
            case 3 -> IndependenceLevel.SUPPORTED_LEVEL_3;
            default -> IndependenceLevel.UNKNOWN;
        };
    }

    private SafetyStatus resolveSafetyStatus(BehaviorLog log, BehaviorEventDefinition definition,
            ObservedOutcome outcome) {
        if (log.getSafetyContext() != null && log.getSafetyContext().safetySeverity() != null) {
            return SafetyStatus.valueOf(log.getSafetyContext().safetySeverity().name());
        }
        if (log.getPayload() instanceof oneuldo.behaviorlog.domain.payload.SafetyBehaviorPayload payload
                && payload.safetyStatus() != null) {
            return payload.safetyStatus();
        }
        if (log.getSafetyContext() != null && Boolean.TRUE.equals(log.getSafetyContext().nearMiss())) {
            return SafetyStatus.YELLOW;
        }
        if (!definition.safetyRelevant()) return null;
        return outcome == ObservedOutcome.FAILURE ? SafetyStatus.RED : SafetyStatus.GREEN;
    }

    private EnumSet<NormalizationFlag> resolveFlags(BehaviorLog log, BehaviorEventDefinition definition) {
        EnumSet<NormalizationFlag> flags = EnumSet.noneOf(NormalizationFlag.class);
        if (Boolean.TRUE.equals(log.getOfflineQueued())) flags.add(NormalizationFlag.OFFLINE_QUEUED);
        if (log.getContentSource() == ContentSource.FALLBACK) flags.add(NormalizationFlag.FALLBACK_CONTENT);
        if (log.getErrorContext() != null && Boolean.TRUE.equals(log.getErrorContext().selfCorrected())) {
            flags.add(NormalizationFlag.SELF_CORRECTED);
        }
        if (log.getSafetyContext() != null && Boolean.TRUE.equals(log.getSafetyContext().nearMiss())) {
            flags.add(NormalizationFlag.NEAR_MISS);
        }
        Duration arrival = Duration.between(log.getOccurredAt(), log.getReceivedAt());
        if (arrival.compareTo(LATE_ARRIVAL_THRESHOLD) > 0) flags.add(NormalizationFlag.LATE_ARRIVAL);
        if (arrival.compareTo(CLOCK_SKEW_THRESHOLD.negated()) < 0) flags.add(NormalizationFlag.CLOCK_SKEW);
        if (log.getPresentationContext() == null && definition != null
                && switch (definition.actionType()) {
                    case VIEW_INSTRUCTION, SELECT, COMPARE, NAVIGATE, USE_SUPPORT -> true;
                    default -> false;
                }) {
            flags.add(NormalizationFlag.MISSING_OPTIONAL_CONTEXT);
        }
        return flags;
    }

    private void saveEvidence(NormalizedBehaviorEvent normalized, BehaviorEventDefinition definition,
            ObservedOutcome outcome, EvidenceUse evidenceUse) {
        EvidenceDirection direction = switch (outcome) {
            case SUCCESS -> EvidenceDirection.POSITIVE;
            case FAILURE, INVALID -> EvidenceDirection.NEGATIVE;
            case INCOMPLETE, NEUTRAL -> EvidenceDirection.NEUTRAL;
        };
        List<NormalizedBehaviorEvidence> evidence = new ArrayList<>();
        for (var rule : definition.evidenceRules()) {
            EvidenceRole role = evidenceUse == EvidenceUse.CONTEXT_ONLY
                    || evidenceUse == EvidenceUse.ACCESSIBILITY_ONLY
                    ? EvidenceRole.CONTEXT
                    : rule.role();
            evidence.add(new NormalizedBehaviorEvidence(
                    normalized, rule.skillCode(), direction, role));
        }
        evidenceRepository.saveAll(evidence);
    }

    private void saveMeasurements(NormalizedBehaviorEvent normalized, BehaviorLog log,
            BehaviorEventDefinition definition) {
        List<NormalizedBehaviorMeasurement> measurements = measurementExtractor.extract(log, definition).stream()
                .map(value -> new NormalizedBehaviorMeasurement(
                        normalized, value.metricCode(), value.numericValue(), value.codeValue(),
                        value.targetNumericValue(), value.unit(), value.valueSemantics()))
                .toList();
        measurementRepository.saveAll(measurements);
    }

    private boolean positive(Integer value) {
        return value != null && value > 0;
    }
}
