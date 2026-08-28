package oneuldo.behaviorlog.normalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.TextLevel;
import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorNormalizationAttemptRepository;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BehaviorNormalizationPipelineTest {

    @Autowired private BehaviorLogService behaviorLogService;
    @Autowired private MemberRepository memberRepository;
    @Autowired private NormalizedBehaviorEventRepository eventRepository;
    @Autowired private BehaviorNormalizationAttemptRepository attemptRepository;
    @Autowired private BehaviorSessionIntegrityRepository sessionIntegrityRepository;

    @Test
    void 원본_커밋_후_세션_조정과_정규화를_완료한다() {
        String suffix = UUID.randomUUID().toString();
        Member member = memberRepository.save(new Member(
                "pipeline-" + suffix, "encoded-password", "파이프라인 사용자",
                suffix + "@example.com", MemberRole.CHILD, LocalDate.of(2000, 1, 1)));
        UUID sessionId = UUID.randomUUID();

        var response = behaviorLogService.record(member.getId(), request(sessionId));

        var normalized = eventRepository.findByBehaviorLogIdAndNormalizerVersion(
                response.id(), BehaviorNormalizationService.NORMALIZER_VERSION).orElseThrow();
        var attempt = attemptRepository.findByBehaviorLogIdAndNormalizerVersion(
                response.id(), BehaviorNormalizationService.NORMALIZER_VERSION).orElseThrow();
        var integrity = sessionIntegrityRepository.findByMemberIdAndSessionId(
                member.getId(), sessionId).orElseThrow();
        assertEquals(NormalizationStatus.NORMALIZED, normalized.getNormalizationStatus());
        assertEquals(NormalizationAttemptStatus.COMPLETED, attempt.getStatus());
        assertEquals(integrity.getId(), normalized.getSessionIntegrity().getId());
        assertTrue(integrity.getMissingEventSequences().isEmpty());
    }

    private BehaviorLogRequest request(UUID sessionId) {
        return new BehaviorLogRequest(
                new EventMetadata(UUID.randomUUID(), 1L,
                        BehaviorLogService.SUPPORTED_SCHEMA_VERSION, "1.0.0", "shopping-v1",
                        false, null, Instant.now()),
                new IdentityContext(sessionId),
                new TaskContext("LIFE_SIMULATION", UUID.randomUUID(), "shopping-v1", 1,
                        "DEFAULT", EvidenceContext.TRAINING_TASK),
                new ActionContext("SHOP.ITEM_SELECTED", "SELECT_ITEM", UUID.randomUUID(),
                        StepOutcome.SUCCESS, 1, 100L, "OPEN_LIST"),
                new AccessibilityContext(InstructionMode.PICTURE, TextLevel.EASY,
                        false, true, ControllerMode.TOUCH),
                null, null, null, null, null, null, null, null, null,
                new ShoppingBehaviorPayload(
                        null, null, null, null, null, null, null, null, null, null,
                        1, 1, null, null, null, "ITEM_A", null, null)
        );
    }
}
