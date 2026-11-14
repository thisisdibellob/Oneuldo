package oneuldo.behaviorlog.normalization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import jakarta.validation.Validator;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.*;
import oneuldo.behaviorlog.domain.payload.*;
import oneuldo.behaviorlog.domain.type.*;
import oneuldo.behaviorlog.normalization.domain.*;
import oneuldo.behaviorlog.normalization.repository.*;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.personalization.service.MarketQuestTimePolicy;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(classes = oneuldo.OneuldoApplication.class,
        properties = "spring.datasource.url=jdbc:h2:mem:shopping-timing-telemetry;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@Transactional
class ShoppingTimingTelemetryTest {
    private static final Instant START = Instant.parse("2026-10-10T00:00:00Z");
    @Autowired private BehaviorLogService ingest;
    @Autowired private BehaviorLogRepository logs;
    @Autowired private BehaviorNormalizationService normalize;
    @Autowired private NormalizedBehaviorMeasurementRepository measurements;
    @Autowired private NormalizedBehaviorEvidenceRepository evidence;
    @Autowired private MemberRepository members;
    @Autowired private EntityManager entityManager;
    @Autowired private ObjectMapper mapper;
    @Autowired private Validator validator;
    @Autowired private BehaviorAnalysisInputService inputs;
    private Member member;

    @BeforeEach void createMember() {
        String suffix = UUID.randomUUID().toString();
        member = members.save(new Member("timing-" + suffix, "encoded", "시간 기록 사용자",
                suffix + "@example.com", MemberRole.CHILD, LocalDate.of(2000, 1, 1)));
    }

    @Test void timeoutSnapshotRetainsRawStateAndStructuralMeasurementsThroughAnalysisInput() throws Exception {
        UUID session = UUID.randomUUID();
        var started = payload(timing(MarketQuestTimePolicy.DEFAULT_SECONDS, START, 0L));
        var expired = payload(timing(MarketQuestTimePolicy.DEFAULT_SECONDS, START,
                MarketQuestTimePolicy.DEFAULT_SECONDS * 1000L + 12_345L));
        ingest.record(member.getId(), request(session, 1, "SHOP.TIME_LIMIT_STARTED", started, null));
        UUID expiredId = ingest.record(member.getId(), request(session, 2, "SHOP.TIME_LIMIT_EXPIRED", expired, null)).id();
        ingest.record(member.getId(), request(session, 3, "SESSION_ENDED", expired,
                new SessionEndContext(SessionEndReason.TIME_LIMIT_EXPIRED, 1, 20_000L)));
        entityManager.flush();
        entityManager.clear();

        var stored = (ShoppingBehaviorPayload) logs.findById(expiredId).orElseThrow().getPayload();
        assertThat(stored.timing()).isEqualTo(expired.timing());
        assertThat(stored.missingItemIds()).containsExactly("carrot");
        assertThat(stored.marketContent()).containsEntry("timeLimitSeconds", MarketQuestTimePolicy.DEFAULT_SECONDS);
        assertThat(mapper.readTree(mapper.writeValueAsString(stored)).path("timing").path("startedAt").asString())
                .isEqualTo(START.toString());

        var event = normalize.normalize(expiredId);
        assertThat(event.getNormalizationStatus()).isEqualTo(NormalizationStatus.NORMALIZED);
        assertThat(event.getOutcome()).isEqualTo(ObservedOutcome.INCOMPLETE);
        assertThat(event.getErrorType()).isEqualTo(ErrorType.NONE);
        assertThat(event.getEvidenceUse()).isEqualTo(EvidenceUse.CONTEXT_ONLY);
        assertThat(evidence.findAllByNormalizedEventId(event.getId())).allSatisfy(value -> {
            assertThat(value.getDirection()).isEqualTo(EvidenceDirection.NEUTRAL);
            assertThat(value.getEvidenceRole()).isEqualTo(EvidenceRole.CONTEXT);
        });
        var values = measurements.findAllByNormalizedEventId(event.getId());
        assertThat(values).anySatisfy(value -> {
            assertThat(value.getMetricCode()).isEqualTo("timeElapsedMs");
            assertThat(value.getNumericValue().longValueExact()).isEqualTo(expired.timing().elapsedMs());
        });
        assertThat(values).anySatisfy(value -> {
            assertThat(value.getMetricCode()).isEqualTo("timeStartedAt");
            assertThat(value.getCodeValue()).isEqualTo(START.toString());
        });
        assertThat(values).extracting(NormalizedBehaviorMeasurement::getMetricCode)
                .contains("timeLimitSeconds", "timePolicyVersion", "timeRemainingMs", "timeExpired", "timeClockBasis")
                .doesNotContain("checkoutSubmitCount");
        var snapshot = inputs.createForSession(member.getId(), null, session);
        var terminal = snapshot.input().sessions().getFirst().events().get(1);
        assertThat(terminal.behaviorLogId()).isEqualTo(expiredId);
        assertThat(((ShoppingBehaviorPayload) terminal.payload()).timing()).isEqualTo(expired.timing());
        assertThat(snapshot.input().sessions().getFirst().events()).extracting(value -> value.action().eventCode())
                .doesNotContain("SHOP.CHECKOUT_SUBMITTED");
    }

    @Test void legacyTimingAbsenceProducesNoZeroOrInferredTimeoutMeasurements() throws Exception {
        var payload = (ShoppingBehaviorPayload) mapper.readValue("{\"type\":\"SHOPPING\",\"itemId\":\"carrot\"}", BehaviorPayload.class);
        assertThat(payload.timing()).isNull();
        UUID id = ingest.record(member.getId(), request(UUID.randomUUID(), 1, "SHOP.ITEM_SELECTED", payload, null)).id();
        var event = normalize.normalize(id);
        assertThat(event.getNormalizationStatus()).isEqualTo(NormalizationStatus.NORMALIZED);
        assertThat(measurements.findAllByNormalizedEventId(event.getId())).extracting(NormalizedBehaviorMeasurement::getMetricCode)
                .noneMatch(code -> code.startsWith("time"));
    }

    @Test void policyBoundariesAndNullablePrestartAreAcceptedWhileMalformedTimingIsRejected() throws Exception {
        for (int seconds : List.of(MarketQuestTimePolicy.MINIMUM_SECONDS, MarketQuestTimePolicy.MAXIMUM_SECONDS)) {
            var prestart = payload(timing(seconds, null, 0L));
            assertThat(validator.validate(prestart)).isEmpty();
            ingest.record(member.getId(), request(UUID.randomUUID(), 1, "SHOP.MISSION_PRESENTED", prestart, null));
            ingest.record(member.getId(), request(UUID.randomUUID(), 1, "SHOP.TIME_LIMIT_STARTED", payload(timing(seconds, START, 0L)), null));
            ingest.record(member.getId(), request(UUID.randomUUID(), 1, "SHOP.TIME_LIMIT_EXPIRED", payload(timing(seconds, START, seconds * 1000L)), null));
        }
        for (int seconds : List.of(MarketQuestTimePolicy.MINIMUM_SECONDS - 1, MarketQuestTimePolicy.MAXIMUM_SECONDS + 1)) {
            var invalid = payload(timing(seconds, START, 0L));
            assertThat(validator.validate(invalid)).isNotEmpty();
            reject("SHOP.TIME_LIMIT_STARTED", invalid);
        }
        int limit = MarketQuestTimePolicy.DEFAULT_SECONDS;
        reject("SHOP.TIME_LIMIT_STARTED", payload(timing(limit, null, 0L)));
        reject("SHOP.TIME_LIMIT_EXPIRED", payload(timing(limit, START, limit * 1000L - 1)));
        reject("SHOP.TIME_LIMIT_STARTED", payload(timing(limit, START, limit * 1000L)));
        reject("SHOP.TIME_LIMIT_EXPIRED", mapper.readValue("{\"type\":\"SHOPPING\"}", ShoppingBehaviorPayload.class));
        reject("SHOP.ITEM_SELECTED", payload(new ShoppingTimingContext(limit, MarketQuestTimePolicy.VERSION,
                START, 2000L, 0L, false, "WALL_CLOCK")));
        var missingElapsed = mapper.readValue("""
                {"type":"SHOPPING","timing":{"timeLimitSeconds":%d,"policyVersion":"%s",
                 "startedAt":"2026-10-10T00:00:00Z","remainingMs":%d,"expired":false,"clockBasis":"WALL_CLOCK"}}
                """.formatted(limit, MarketQuestTimePolicy.VERSION, limit * 1000L), ShoppingBehaviorPayload.class);
        assertThat(missingElapsed.timing().elapsedMs()).isNull();
        reject("SHOP.ITEM_SELECTED", missingElapsed);
    }

    @Test void malformedStoredTimeoutIsQuarantinedInsteadOfBecomingAnAbilityFailure() throws Exception {
        var wrong = payload(timing(MarketQuestTimePolicy.DEFAULT_SECONDS, START, 0L));
        var raw = logs.save(new BehaviorLog(member, null,
                request(UUID.randomUUID(), 1, "SHOP.TIME_LIMIT_EXPIRED", wrong, null), START));
        var event = normalize.normalize(raw.getId());
        assertThat(event.getNormalizationStatus()).isEqualTo(NormalizationStatus.QUARANTINED);
        assertThat(event.getNormalizationIssues()).anySatisfy(issue -> {
            assertThat(issue.issueCode()).isEqualTo("EXPIRED_TIME_NOT_EXPIRED");
            assertThat(issue.fieldPath()).isEqualTo("payload.timing");
        });
        assertThat(evidence.findAllByNormalizedEventId(event.getId())).isEmpty();
        assertThat(measurements.findAllByNormalizedEventId(event.getId())).isEmpty();
    }

    @Test void newestTimeoutIsAvailableBeforeSessionExitAndNewerAbortDoesNotReplaceMarketTerminal() throws Exception {
        UUID submittedSession = UUID.randomUUID(), expiredSession = UUID.randomUUID(), abortedSession = UUID.randomUUID();
        var plain = mapper.readValue("{\"type\":\"SHOPPING\"}", ShoppingBehaviorPayload.class);
        logs.save(new BehaviorLog(member, null, request(submittedSession, 1, "SHOP.CHECKOUT_SUBMITTED", plain, null), START));
        var expired = logs.save(new BehaviorLog(member, null, request(expiredSession, 1, "SHOP.TIME_LIMIT_EXPIRED",
                payload(timing(MarketQuestTimePolicy.DEFAULT_SECONDS, START, MarketQuestTimePolicy.DEFAULT_SECONDS * 1000L)), null), START.plusSeconds(1)));
        logs.save(new BehaviorLog(member, null, request(abortedSession, 1, "SESSION_ENDED", plain,
                new SessionEndContext(SessionEndReason.USER_ABORTED, 0, 0L)), START.plusSeconds(2)));
        entityManager.flush();
        assertThat(logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member.getId(),
                List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"))).contains(expired);
        // Keep the existing ability to analyze interrupted sessions too.
        assertThat(logs.findLatestCompletedSessionIds(member.getId(), PageRequest.of(0, 10)))
                .containsExactly(abortedSession, expiredSession, submittedSession);
    }

    private void reject(String eventCode, BehaviorPayload payload) {
        assertThatThrownBy(() -> ingest.record(member.getId(), request(UUID.randomUUID(), 1, eventCode, payload, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private ShoppingTimingContext timing(int seconds, Instant startedAt, long elapsedMs) {
        return new ShoppingTimingContext(seconds, MarketQuestTimePolicy.VERSION, startedAt, elapsedMs,
                Math.max(0L, seconds * 1000L - elapsedMs), elapsedMs >= seconds * 1000L, "WALL_CLOCK");
    }

    private ShoppingBehaviorPayload payload(ShoppingTimingContext timing) throws Exception {
        return mapper.readValue("""
                {"type":"SHOPPING","itemId":"carrot","cartItemCount":1,"cartTotalAmount":3000,
                 "remainingObjectiveCount":1,"missingItemIds":["carrot"],
                 "marketContent":{"timeLimitSeconds":%d},"timing":%s}
                """.formatted(timing.timeLimitSeconds(), mapper.writeValueAsString(timing)), ShoppingBehaviorPayload.class);
    }

    private BehaviorLogRequest request(UUID session, long sequence, String code, BehaviorPayload payload, SessionEndContext end) {
        return new BehaviorLogRequest(new EventMetadata(UUID.randomUUID(), sequence, "behavior-event-v1", "test",
                "market-timed-test", false, null, START.plusSeconds(sequence)), new IdentityContext(session),
                new TaskContext("MARKET_SIMULATION", UUID.randomUUID(), "market-timed-test", 2, "BASELINE", EvidenceContext.ASSESSMENT_TASK),
                new ActionContext(code, "TIMED_TEST", null, StepOutcome.INCOMPLETE, (int) sequence, null, null),
                new AccessibilityContext(InstructionMode.TEXT, TextLevel.STANDARD, false, false, ControllerMode.TOUCH),
                null, end == null ? null : new TaskResultContext(false, null, 300_000L), null, null, null, null, null, end, null, payload);
    }
}
