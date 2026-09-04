package oneuldo.behaviorlog.normalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.context.ValidityContext;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.payload.HygieneClothingBehaviorPayload;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.TextLevel;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.domain.CanonicalActionType;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.EvidenceUse;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEvidenceRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorMeasurementRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.normalization.service.BehaviorSessionIntegrityService;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class BehaviorNormalizationServiceTest {

    @Autowired private BehaviorLogService behaviorLogService;
    @Autowired private BehaviorNormalizationService normalizationService;
    @Autowired private NormalizedBehaviorEventRepository eventRepository;
    @Autowired private NormalizedBehaviorEvidenceRepository evidenceRepository;
    @Autowired private NormalizedBehaviorMeasurementRepository measurementRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private BehaviorSessionIntegrityService sessionIntegrityService;
    @Autowired private ObjectMapper objectMapper;

    private Member member;

    @BeforeEach
    void setUp() {
        String suffix = UUID.randomUUID().toString();
        member = memberRepository.save(new Member(
                "normalization-" + suffix,
                "encoded-password",
                "정규화 사용자",
                suffix + "@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
    }

    @Test
    void 알려진_이벤트를_표준_이벤트와_근거와_측정값으로_정규화한다() {
        UUID logId = save("SHOP.WRONG_ITEM_SELECTED", shoppingPayload(), null);

        var normalized = normalizationService.normalize(logId);

        assertEquals(NormalizationStatus.NORMALIZED, normalized.getNormalizationStatus());
        assertEquals(BehaviorDomain.SHOPPING, normalized.getDomain());
        assertEquals(CanonicalActionType.SELECT, normalized.getActionType());
        assertEquals(ObservedOutcome.FAILURE, normalized.getOutcome());
        assertEquals(ErrorType.WRONG_SELECTION, normalized.getErrorType());
        assertEquals(EvidenceUse.TRAINING_PROGRESS, normalized.getEvidenceUse());
        assertEquals(ValidityStatus.VALID, normalized.getValidityStatus());
        assertEquals(BehaviorEventRegistry.REGISTRY_VERSION, normalized.getRegistryVersion());
        assertEquals(BehaviorEventRegistry.MEASUREMENT_RULE_VERSION,
                normalized.getMeasurementRuleVersion());
        assertEquals(1, evidenceRepository.findAllByNormalizedEventId(normalized.getId()).size());
        assertTrue(measurementRepository.findAllByNormalizedEventId(normalized.getId()).stream()
                .anyMatch(value -> value.getMetricCode().equals("selectedQuantity")
                        && value.getTargetNumericValue().intValueExact() == 2));
    }

    @Test
    void 이동_구간은_문맥_근거와_거리_시간_측정값으로_정규화한다() throws Exception {
        BehaviorPayload payload = objectMapper.readValue("""
                {
                  "type": "SHOPPING",
                  "controlMode": "joystick",
                  "durationMs": 5000,
                  "pathDistance": 142.5,
                  "straightDistance": 80.25,
                  "travelDistance": 142.5
                }
                """, BehaviorPayload.class);

        var normalized = normalizationService.normalize(
                save("SHOP.MOVEMENT_SEGMENT_SUMMARIZED", payload, null));

        assertEquals(NormalizationStatus.NORMALIZED, normalized.getNormalizationStatus());
        assertEquals(CanonicalActionType.NAVIGATE, normalized.getActionType());
        assertEquals(EvidenceUse.CONTEXT_ONLY, normalized.getEvidenceUse());
        var measurements = measurementRepository.findAllByNormalizedEventId(normalized.getId());
        assertTrue(measurements.stream().anyMatch(value ->
                value.getMetricCode().equals("movementPathDistance")
                        && value.getNumericValue().doubleValue() == 142.5));
        assertTrue(measurements.stream().anyMatch(value ->
                value.getMetricCode().equals("movementDurationMs")
                        && value.getNumericValue().longValueExact() == 5000L));
    }

    @Test
    void 목표_진열장_통과는_공간탐색의_프로파일_근거로_정규화한다() throws Exception {
        BehaviorPayload payload = objectMapper.readValue("""
                {
                  "type": "SHOPPING",
                  "stationId": "produce",
                  "visitIndex": 2,
                  "proximityDurationMs": 1800,
                  "targetPassedWithoutSelectionCount": 1
                }
                """, BehaviorPayload.class);

        var normalized = normalizationService.normalize(save("SHOP.TARGET_PASSED", payload, null));

        assertEquals(NormalizationStatus.NORMALIZED, normalized.getNormalizationStatus());
        assertEquals(EvidenceUse.TRAINING_PROGRESS, normalized.getEvidenceUse());
        assertTrue(evidenceRepository.findAllByNormalizedEventId(normalized.getId()).stream()
                .anyMatch(value -> value.getSkillCode().equals("SPATIAL_NAVIGATION")));
        assertTrue(measurementRepository.findAllByNormalizedEventId(normalized.getId()).stream()
                .anyMatch(value -> value.getMetricCode().equals("targetPassed")));
    }

    @Test
    void 필수_payload_필드가_없으면_필드_경로와_함께_격리한다() {
        ShoppingBehaviorPayload missingItemId = new ShoppingBehaviorPayload(
                10.0, 8.0, 0.8, 1, 0, 0, 0, 0, 0, 0L,
                2, 1, 1000L, 5000L, null, null, null, null);

        var normalized = normalizationService.normalize(
                save("SHOP.ITEM_SELECTED", missingItemId, null));

        assertEquals(NormalizationStatus.QUARANTINED, normalized.getNormalizationStatus());
        assertTrue(normalized.getNormalizationIssues().stream()
                .anyMatch(issue -> issue.issueCode().equals("MISSING_REQUIRED_FIELD")
                        && issue.fieldPath().equals("payload.itemId")));
    }

    @Test
    void 하나의_행동을_여러_능력_근거로_보존한다() {
        var normalized = normalizationService.normalize(
                save("SHOP.OUT_OF_STOCK_DETECTED", shoppingPayload(), null));

        var evidence = evidenceRepository.findAllByNormalizedEventId(normalized.getId());
        assertEquals(2, evidence.size());
        assertTrue(evidence.stream().anyMatch(value ->
                value.getSkillCode().equals("SHOPPING_PROBLEM_RECOGNITION")));
        assertTrue(evidence.stream().anyMatch(value ->
                value.getSkillCode().equals("EXECUTIVE_FUNCTION")));
    }

    @Test
    void 늦은_앞_순번이_도착하면_세션_공백_상태를_복구한다() {
        UUID sessionId = UUID.randomUUID();
        save("SHOP.ITEM_SELECTED", shoppingPayload(), null, sessionId, 2L);

        var gapped = sessionIntegrityService.reconcile(member.getId(), sessionId);

        assertEquals(SessionIntegrityStatus.OPEN_WITH_GAPS, gapped.getStatus());
        assertEquals(1, gapped.getMissingEventCount());
        assertEquals(java.util.List.of(1L), gapped.getMissingEventSequences());

        save("SHOP.ITEM_SELECTED", shoppingPayload(), null, sessionId, 1L);
        var recovered = sessionIntegrityService.reconcile(member.getId(), sessionId);

        assertEquals(SessionIntegrityStatus.OPEN, recovered.getStatus());
        assertEquals(0, recovered.getMissingEventCount());
        assertTrue(recovered.getMissingEventSequences().isEmpty());
    }

    @Test
    void 이벤트와_payload_종류가_다르면_삭제하지_않고_격리한다() {
        var hygienePayload = new HygieneClothingBehaviorPayload(
                "BRUSH_TEETH", "TOOTHBRUSH", null, null, null, true, null, false);
        UUID logId = save("SHOP.ITEM_SELECTED", hygienePayload, null);

        var normalized = normalizationService.normalize(logId);

        assertEquals(NormalizationStatus.QUARANTINED, normalized.getNormalizationStatus());
        assertEquals(ValidityStatus.INVALID_PAYLOAD, normalized.getValidityStatus());
        assertEquals(EvidenceUse.EXCLUDED, normalized.getEvidenceUse());
        assertTrue(evidenceRepository.findAllByNormalizedEventId(normalized.getId()).isEmpty());
        assertTrue(measurementRepository.findAllByNormalizedEventId(normalized.getId()).isEmpty());
    }

    @Test
    void 등록되지_않은_이벤트는_임의_추론하지_않는다() {
        UUID logId = save("SHOP.NEW_UNREGISTERED_EVENT", shoppingPayload(), null);

        var normalized = normalizationService.normalize(logId);

        assertEquals(NormalizationStatus.QUARANTINED, normalized.getNormalizationStatus());
        assertEquals(ValidityStatus.UNKNOWN_EVENT_CODE, normalized.getValidityStatus());
        assertEquals(null, normalized.getDomain());
        assertEquals("SHOP.NEW_UNREGISTERED_EVENT", normalized.getSourceEventCode());
    }

    @Test
    void 기술_오류가_있는_로그는_보존하되_근거에서_제외한다() {
        UUID logId = save("SHOP.ITEM_SELECTED", shoppingPayload(),
                new ValidityContext(null, true, false));

        var normalized = normalizationService.normalize(logId);

        assertEquals(NormalizationStatus.NORMALIZED, normalized.getNormalizationStatus());
        assertEquals(ValidityStatus.INVALID_TECHNICAL, normalized.getValidityStatus());
        assertEquals(EvidenceUse.EXCLUDED, normalized.getEvidenceUse());
        assertTrue(evidenceRepository.findAllByNormalizedEventId(normalized.getId()).isEmpty());
    }

    @Test
    void 같은_원본과_정규화기_버전은_한_번만_생성한다() {
        UUID logId = save("SHOP.ITEM_SELECTED", shoppingPayload(), null);

        var first = normalizationService.normalize(logId);
        var second = normalizationService.normalize(logId);

        assertSame(first, second);
        assertEquals(1, eventRepository.count());
    }

    private UUID save(String eventCode, BehaviorPayload payload, ValidityContext validity) {
        return save(eventCode, payload, validity, UUID.randomUUID(), 1L);
    }

    private UUID save(String eventCode, BehaviorPayload payload, ValidityContext validity,
            UUID sessionId, long eventSequence) {
        BehaviorLogRequest request = new BehaviorLogRequest(
                new EventMetadata(
                        UUID.randomUUID(), eventSequence, BehaviorLogService.SUPPORTED_SCHEMA_VERSION,
                        "1.0.0", "shopping-content-v1", false, null,
                        Instant.parse("2026-08-28T10:00:00Z")
                ),
                new IdentityContext(sessionId),
                new TaskContext(
                        "LIFE_SIMULATION", UUID.randomUUID(), "shopping-task-v1", 1,
                        "DEFAULT", EvidenceContext.TRAINING_TASK
                ),
                new ActionContext(
                        eventCode, "SELECT_ITEM", UUID.randomUUID(), StepOutcome.SUCCESS,
                        1, 300L, "OPEN_LIST"
                ),
                new AccessibilityContext(
                        InstructionMode.PICTURE, TextLevel.EASY, false, true, ControllerMode.TOUCH
                ),
                null, null, null, null, null, validity, null, null, null, payload
        );
        return behaviorLogService.record(member.getId(), request).id();
    }

    private ShoppingBehaviorPayload shoppingPayload() {
        return new ShoppingBehaviorPayload(
                10.0, 8.0, 0.8, 1, 1, 0, 0, 0, 0, 0L,
                2, 1, 1000L, 5000L, null, "ITEM_A", null, null
        );
    }
}
