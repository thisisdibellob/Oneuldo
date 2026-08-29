package oneuldo.behaviorlog.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLogBatchRequest;
import oneuldo.behaviorlog.domain.BehaviorLogIngestStatus;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.payload.HygieneClothingBehaviorPayload;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.TextLevel;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@Transactional
class BehaviorLogServiceTest {

    @Autowired private BehaviorLogService behaviorLogService;
    @Autowired private BehaviorLogRepository behaviorLogRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private EntityManager entityManager;

    @Test
    void 사용자별_행동_로그를_저장하고_동일_이벤트_재전송은_중복으로_응답한다() {
        Member member = saveMember("behavior-one");
        UUID clientEventId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        BehaviorLogRequest request = request(clientEventId, sessionId, 1, "HYGIENE.TASK_STARTED");

        var accepted = behaviorLogService.record(member.getId(), request);
        var duplicate = behaviorLogService.record(member.getId(), request);

        assertEquals(BehaviorLogIngestStatus.ACCEPTED, accepted.status());
        assertEquals(BehaviorLogIngestStatus.DUPLICATE, duplicate.status());
        assertEquals(accepted.id(), duplicate.id());
        assertEquals(1, behaviorLogRepository.count());

        entityManager.flush();
        entityManager.clear();
        var saved = behaviorLogRepository.findById(accepted.id()).orElseThrow();
        assertEquals(member.getId(), saved.getMember().getId());
        assertEquals(sessionId, saved.getSessionId());
        assertInstanceOf(HygieneClothingBehaviorPayload.class, saved.getPayload());
    }

    @Test
    void 같은_세션_순번에_다른_이벤트가_오면_충돌로_거부한다() {
        Member member = saveMember("behavior-two");
        UUID sessionId = UUID.randomUUID();
        behaviorLogService.record(
                member.getId(),
                request(UUID.randomUUID(), sessionId, 1, "HYGIENE.TASK_STARTED")
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> behaviorLogService.record(
                        member.getId(),
                        request(UUID.randomUUID(), sessionId, 1, "HYGIENE.STEP_COMPLETED")
                )
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        assertEquals(1, behaviorLogRepository.count());
    }

    @Test
    void 배치_로그에_배치_ID를_저장한다() {
        Member member = saveMember("behavior-three");
        UUID batchId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        var batch = new BehaviorLogBatchRequest(batchId, List.of(
                request(UUID.randomUUID(), sessionId, 1, "HYGIENE.TASK_STARTED"),
                request(UUID.randomUUID(), sessionId, 2, "HYGIENE.STEP_COMPLETED")
        ));

        var response = behaviorLogService.recordBatch(member.getId(), batch);

        assertEquals(batchId, response.batchId());
        assertEquals(2, response.events().size());
        assertEquals(2, behaviorLogRepository.count());
        behaviorLogRepository.findAll().forEach(log -> assertEquals(batchId, log.getBatchId()));
    }

    @Test
    void 지원하지_않는_스키마_버전은_저장하지_않는다() {
        Member member = saveMember("behavior-four");
        BehaviorLogRequest valid = request(
                UUID.randomUUID(),
                UUID.randomUUID(),
                1,
                "HYGIENE.TASK_STARTED"
        );
        BehaviorLogRequest unsupported = new BehaviorLogRequest(
                new EventMetadata(
                        valid.metadata().clientEventId(),
                        valid.metadata().eventSequence(),
                        "behavior-event-v2",
                        valid.metadata().appVersion(),
                        valid.metadata().contentVersion(),
                        valid.metadata().offlineQueued(),
                        valid.metadata().devicePerformanceClass(),
                        valid.metadata().occurredAt()
                ),
                valid.identity(),
                valid.task(),
                valid.action(),
                valid.accessibility(),
                valid.presentation(),
                valid.taskResult(),
                valid.error(),
                valid.support(),
                valid.safety(),
                valid.validity(),
                valid.simulation(),
                valid.sessionEnd(),
                valid.userExperience(),
                valid.payload()
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> behaviorLogService.record(member.getId(), unsupported)
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        assertEquals(0, behaviorLogRepository.count());
    }

    private Member saveMember(String loginId) {
        return memberRepository.save(new Member(
                loginId,
                "encoded-password",
                "행동 로그 사용자",
                loginId + "@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
    }

    private BehaviorLogRequest request(
            UUID clientEventId,
            UUID sessionId,
            long sequence,
            String eventCode
    ) {
        return new BehaviorLogRequest(
                new EventMetadata(
                        clientEventId,
                        sequence,
                        BehaviorLogService.SUPPORTED_SCHEMA_VERSION,
                        "1.0.0",
                        "hygiene-content-v1",
                        false,
                        null,
                        Instant.parse("2026-08-28T10:00:00Z")
                ),
                new IdentityContext(sessionId),
                new TaskContext(
                        "LIFE_SIMULATION",
                        UUID.randomUUID(),
                        "hygiene-task-v1",
                        1,
                        "DEFAULT",
                        EvidenceContext.TRAINING_TASK
                ),
                new ActionContext(
                        eventCode,
                        "HYGIENE_TASK_START",
                        UUID.randomUUID(),
                        StepOutcome.SUCCESS,
                        1,
                        300L,
                        "OPEN_HYGIENE_TOOLS"
                ),
                new AccessibilityContext(
                        InstructionMode.PICTURE,
                        TextLevel.EASY,
                        false,
                        true,
                        ControllerMode.TOUCH
                ),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                new HygieneClothingBehaviorPayload(
                        "BRUSH_TEETH",
                        "TOOTHBRUSH",
                        null,
                        null,
                        null,
                        true,
                        null,
                        false
                )
        );
    }
}
