package oneuldo.behaviorlog.analysis.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.EventAction;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.EventTask;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.EventTimeline;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.Measurement;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.Normalization;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.SessionIntegrity;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.SessionTimeline;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputEventLink;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputEventLinkRepository;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.context.SimulationContext;
import oneuldo.behaviorlog.normalization.domain.BehaviorSessionIntegrity;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorMeasurement;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorMeasurementRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.global.exception.MemberNotFoundException;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BehaviorAnalysisInputService {

    public static final String SCHEMA_VERSION = "behavior-analysis-input-v1";

    private final MemberRepository memberRepository;
    private final BehaviorLogRepository logRepository;
    private final NormalizedBehaviorEventRepository eventRepository;
    private final NormalizedBehaviorMeasurementRepository measurementRepository;
    private final BehaviorSessionIntegrityRepository integrityRepository;
    private final BehaviorAnalysisInputSnapshotRepository snapshotRepository;
    private final BehaviorAnalysisInputEventLinkRepository linkRepository;
    private final String subjectSalt;

    public BehaviorAnalysisInputService(
            MemberRepository memberRepository,
            BehaviorLogRepository logRepository,
            NormalizedBehaviorEventRepository eventRepository,
            NormalizedBehaviorMeasurementRepository measurementRepository,
            BehaviorSessionIntegrityRepository integrityRepository,
            BehaviorAnalysisInputSnapshotRepository snapshotRepository,
            BehaviorAnalysisInputEventLinkRepository linkRepository,
            @Value("${security.jwt.secret}") String subjectSalt
    ) {
        this.memberRepository = memberRepository;
        this.logRepository = logRepository;
        this.eventRepository = eventRepository;
        this.measurementRepository = measurementRepository;
        this.integrityRepository = integrityRepository;
        this.snapshotRepository = snapshotRepository;
        this.linkRepository = linkRepository;
        this.subjectSalt = subjectSalt;
    }

    @Transactional
    public BehaviorAnalysisInputResponse create(UUID memberId, BehaviorAnalysisInputRequest request) {
        Member member = memberRepository.findById(memberId).orElseThrow(MemberNotFoundException::new);
        Instant generatedAt = Instant.now();
        Instant from = request == null || request.analysisFrom() == null
                ? Instant.EPOCH : request.analysisFrom();
        Instant to = request == null || request.analysisTo() == null
                ? generatedAt : request.analysisTo();
        if (from.isAfter(to)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "analysisFrom은 analysisTo보다 늦을 수 없습니다.");
        }

        List<BehaviorLog> logs = logRepository.findAnalysisInputLogs(memberId, from, to);
        Map<UUID, NormalizedBehaviorEvent> normalizedByLog = normalizedByLog(logs);
        Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent =
                measurementsByEvent(normalizedByLog.values());
        Map<UUID, BehaviorSessionIntegrity> integrityBySession = integrityBySession(memberId, logs);
        UUID datasetId = UUID.randomUUID();
        List<SessionTimeline> sessions = buildSessions(
                logs, normalizedByLog, measurementsByEvent, integrityBySession);
        BehaviorAnalysisInput input = new BehaviorAnalysisInput(
                SCHEMA_VERSION,
                datasetId,
                generatedAt,
                new BehaviorAnalysisInput.AnalysisWindow(from, to),
                anonymousSubjectId(memberId),
                sessions.size(),
                logs.size(),
                sessions
        );

        BehaviorAnalysisInputSnapshot snapshot = snapshotRepository.save(
                new BehaviorAnalysisInputSnapshot(member, input));
        List<BehaviorAnalysisInputEventLink> links = logs.stream()
                .map(log -> new BehaviorAnalysisInputEventLink(
                        snapshot, log, normalizedByLog.get(log.getId())))
                .toList();
        linkRepository.saveAll(links);
        return BehaviorAnalysisInputResponse.from(snapshot);
    }

    @Transactional(readOnly = true)
    public BehaviorAnalysisInputResponse findLatest(UUID memberId) {
        requireMember(memberId);
        return snapshotRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId)
                .map(BehaviorAnalysisInputResponse::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "생성된 행동 분석 입력이 없습니다."));
    }

    @Transactional(readOnly = true)
    public BehaviorAnalysisInputResponse find(UUID memberId, UUID datasetId) {
        requireMember(memberId);
        return snapshotRepository.findByIdAndMemberId(datasetId, memberId)
                .map(BehaviorAnalysisInputResponse::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "행동 분석 입력을 찾을 수 없습니다."));
    }

    private void requireMember(UUID memberId) {
        if (!memberRepository.existsById(memberId)) throw new MemberNotFoundException();
    }

    private Map<UUID, NormalizedBehaviorEvent> normalizedByLog(List<BehaviorLog> logs) {
        if (logs.isEmpty()) return Map.of();
        return eventRepository.findAnalysisInputEvents(
                        logs.stream().map(BehaviorLog::getId).toList(),
                        BehaviorNormalizationService.NORMALIZER_VERSION).stream()
                .collect(Collectors.toMap(
                        event -> event.getBehaviorLog().getId(), Function.identity()));
    }

    private Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent(
            java.util.Collection<NormalizedBehaviorEvent> events) {
        if (events.isEmpty()) return Map.of();
        return measurementRepository.findAllByNormalizedEventIdIn(
                        events.stream().map(NormalizedBehaviorEvent::getId).toList()).stream()
                .collect(Collectors.groupingBy(
                        value -> value.getNormalizedEvent().getId()));
    }

    private Map<UUID, BehaviorSessionIntegrity> integrityBySession(
            UUID memberId, List<BehaviorLog> logs) {
        List<UUID> sessionIds = logs.stream().map(BehaviorLog::getSessionId).distinct().toList();
        if (sessionIds.isEmpty()) return Map.of();
        return integrityRepository.findAllByMemberIdAndSessionIdIn(memberId, sessionIds).stream()
                .collect(Collectors.toMap(BehaviorSessionIntegrity::getSessionId, Function.identity()));
    }

    private List<SessionTimeline> buildSessions(
            List<BehaviorLog> logs,
            Map<UUID, NormalizedBehaviorEvent> normalizedByLog,
            Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent,
            Map<UUID, BehaviorSessionIntegrity> integrityBySession
    ) {
        Map<UUID, List<BehaviorLog>> grouped = logs.stream().collect(Collectors.groupingBy(
                BehaviorLog::getSessionId, LinkedHashMap::new, Collectors.toList()));
        List<SessionTimeline> sessions = new ArrayList<>();
        grouped.forEach((sessionId, sessionLogs) -> {
            List<BehaviorLog> ordered = sessionLogs.stream()
                    .sorted(Comparator.comparingLong(BehaviorLog::getEventSequence)
                            .thenComparing(BehaviorLog::getOccurredAt))
                    .toList();
            Instant startedAt = ordered.stream().map(BehaviorLog::getOccurredAt)
                    .min(Comparator.naturalOrder()).orElseThrow();
            Instant endedAt = ordered.stream().map(BehaviorLog::getOccurredAt)
                    .max(Comparator.naturalOrder()).orElseThrow();
            List<EventTimeline> events = ordered.stream()
                    .map(log -> eventTimeline(log, startedAt, normalizedByLog.get(log.getId()),
                            measurementsByEvent))
                    .toList();
            sessions.add(new SessionTimeline(
                    sessionId, startedAt, endedAt,
                    sessionIntegrity(integrityBySession.get(sessionId)), events));
        });
        return sessions.stream().sorted(Comparator.comparing(SessionTimeline::startedAt)).toList();
    }

    private EventTimeline eventTimeline(
            BehaviorLog log,
            Instant sessionStartedAt,
            NormalizedBehaviorEvent normalized,
            Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent
    ) {
        return new EventTimeline(
                log.getId(),
                normalized == null ? null : normalized.getId(),
                log.getClientEventId(),
                log.getBatchId(),
                log.getEventSequence(),
                log.getOccurredAt(),
                log.getReceivedAt(),
                Math.max(0, Duration.between(sessionStartedAt, log.getOccurredAt()).toMillis()),
                log.getEventSchemaVersion(),
                log.getAppVersion(),
                log.getContentVersion(),
                log.getOfflineQueued(),
                log.getDevicePerformanceClass(),
                new EventTask(
                        log.getGameId(), log.getTaskId(), log.getTaskVersion(), log.getDifficulty(),
                        log.getScenarioVariant(), log.getEvidenceContext()),
                new EventAction(
                        log.getEventCode(), log.getMicroActionId(), log.getStepId(),
                        log.getStepOutcome(), log.getStepOrder(), log.getStartLatencyMs(),
                        log.getFirstAction()),
                log.getAccessibilityContext(),
                log.getPresentationContext(),
                log.getTaskResultContext(),
                log.getErrorContext(),
                log.getSupportContext(),
                log.getSafetyContext(),
                log.getValidityContext(),
                simulationContext(log),
                log.getSessionEndContext(),
                log.getUserExperienceContext(),
                log.getPayload(),
                normalization(normalized, measurementsByEvent)
        );
    }

    private SimulationContext simulationContext(BehaviorLog log) {
        if (log.getQuestInstanceId() == null && log.getContentSource() == null
                && log.getSimulationStarted() == null) return null;
        return new SimulationContext(
                log.getQuestInstanceId(), log.getContentSource(), log.getSimulationStarted());
    }

    private Normalization normalization(
            NormalizedBehaviorEvent event,
            Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent
    ) {
        if (event == null) return null;
        List<Measurement> measurements = measurementsByEvent
                .getOrDefault(event.getId(), List.of()).stream()
                .sorted(Comparator.comparing(NormalizedBehaviorMeasurement::getMetricCode))
                .map(this::measurement)
                .toList();
        return new Normalization(
                event.getNormalizerVersion(), event.getRegistryVersion(),
                event.getMeasurementRuleVersion(), event.getNormalizationStatus(),
                event.getActionType(), event.getOutcome(), event.getValidityStatus(),
                event.getFlags(), event.getNormalizationIssues(), measurements);
    }

    private Measurement measurement(NormalizedBehaviorMeasurement value) {
        return new Measurement(
                value.getMetricCode(), value.getNumericValue(), value.getCodeValue(),
                value.getTargetNumericValue(), value.getUnit(), value.getValueSemantics());
    }

    private SessionIntegrity sessionIntegrity(BehaviorSessionIntegrity integrity) {
        if (integrity == null) return null;
        return new SessionIntegrity(
                integrity.getStatus(), integrity.getHighestEventSequence(),
                integrity.getReceivedEventCount(), integrity.getMissingEventCount(),
                integrity.getMissingEventSequences(), integrity.isFinalized(),
                integrity.getEvaluatedAt());
    }

    private String anonymousSubjectId(UUID memberId) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((subjectSalt + ":" + memberId)
                    .getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다.", exception);
        }
    }
}
