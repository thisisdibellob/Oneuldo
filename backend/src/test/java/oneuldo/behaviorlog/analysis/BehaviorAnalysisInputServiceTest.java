package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputEventLinkRepository;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.SessionEndContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.context.TaskResultContext;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.SessionEndReason;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.TextLevel;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.normalization.service.BehaviorSessionIntegrityService;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@Transactional
class BehaviorAnalysisInputServiceTest {

    private static final Instant STARTED_AT = Instant.parse("2026-09-04T01:00:00Z");

    @Autowired private BehaviorAnalysisInputService inputService;
    @Autowired private BehaviorLogService logService;
    @Autowired private BehaviorNormalizationService normalizationService;
    @Autowired private BehaviorSessionIntegrityService integrityService;
    @Autowired private BehaviorAnalysisInputSnapshotRepository snapshotRepository;
    @Autowired private BehaviorAnalysisInputEventLinkRepository linkRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void 정규화_여부와_관계없이_모든_행동을_순서대로_스냅샷에_담는다() throws Exception {
        Member member = saveMember();
        UUID sessionId = UUID.randomUUID();
        UUID startedLogId = save(member, sessionId, 1, "SHOP.SESSION_STARTED",
                shoppingPayload(), null, null);
        UUID sampledLogId = save(member, sessionId, 2, "SHOP.MOVEMENT_SAMPLED",
                movementPayload(), null, null);
        UUID completedLogId = save(member, sessionId, 3, "SHOP.SESSION_COMPLETED",
                shoppingPayload(), new TaskResultContext(true, 100.0, 20_000L),
                new SessionEndContext(SessionEndReason.COMPLETED, 0, 0L));

        integrityService.reconcile(member.getId(), sessionId);
        normalizationService.normalize(startedLogId);
        normalizationService.normalize(completedLogId);

        var response = inputService.create(member.getId(), new BehaviorAnalysisInputRequest(
                STARTED_AT.minusSeconds(1), STARTED_AT.plusSeconds(30)));

        assertThat(response.input().eventCount()).isEqualTo(3);
        assertThat(response.input().sessions()).hasSize(1);
        var events = response.input().sessions().getFirst().events();
        assertThat(events).extracting(event -> event.action().eventCode())
                .containsExactly(
                        "SHOP.SESSION_STARTED", "SHOP.MOVEMENT_SAMPLED", "SHOP.SESSION_COMPLETED");
        assertThat(events).extracting(event -> event.sequence()).containsExactly(1L, 2L, 3L);
        assertThat(events.get(1).behaviorLogId()).isEqualTo(sampledLogId);
        assertThat(events.get(1).normalization()).isNull();
        assertThat(events.get(1).payload()).isInstanceOf(ShoppingBehaviorPayload.class);
        assertThat(response.input().anonymousSubjectId())
                .doesNotContain(member.getId().toString());
        assertThat(snapshotRepository.count()).isEqualTo(1);
        assertThat(linkRepository.count()).isEqualTo(3);
        assertThat(inputService.findLatest(member.getId()).id()).isEqualTo(response.id());
    }

    private Member saveMember() {
        String suffix = UUID.randomUUID().toString();
        return memberRepository.save(new Member(
                "analysis-" + suffix,
                "encoded-password",
                "행동 분석 입력 사용자",
                suffix + "@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
    }

    private UUID save(
            Member member,
            UUID sessionId,
            long sequence,
            String eventCode,
            BehaviorPayload payload,
            TaskResultContext taskResult,
            SessionEndContext sessionEnd
    ) {
        BehaviorLogRequest request = new BehaviorLogRequest(
                new EventMetadata(
                        UUID.randomUUID(), sequence, BehaviorLogService.SUPPORTED_SCHEMA_VERSION,
                        "1.0.0", "market-micro-behavior-v1", false, null,
                        STARTED_AT.plusSeconds(sequence)),
                new IdentityContext(sessionId),
                new TaskContext(
                        "MARKET_SIMULATION",
                        UUID.fromString("30000000-0000-0000-0000-000000000003"),
                        "market-micro-behavior-v1", 2, "BASELINE",
                        EvidenceContext.ASSESSMENT_TASK),
                new ActionContext(
                        eventCode, "ACTION_" + sequence, null, StepOutcome.SUCCESS,
                        (int) sequence, null, null),
                new AccessibilityContext(
                        InstructionMode.TEXT, TextLevel.STANDARD, false, true,
                        ControllerMode.TOUCH),
                null, taskResult, null, null, null, null, null, sessionEnd, null, payload
        );
        return logService.record(member.getId(), request).id();
    }

    private BehaviorPayload movementPayload() throws Exception {
        return objectMapper.readValue("""
                {
                  "type": "SHOPPING",
                  "x": 210.5,
                  "y": 320.2,
                  "controlMode": "joystick",
                  "blocked": false
                }
                """, BehaviorPayload.class);
    }

    private ShoppingBehaviorPayload shoppingPayload() {
        return new ShoppingBehaviorPayload(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, 10_000L, null, null, null, null);
    }
}
