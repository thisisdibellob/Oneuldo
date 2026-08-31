package oneuldo.behaviorlog.profile.service;

import static oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel.HIGH;
import static oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel.INSUFFICIENT;
import static oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel.LOW;
import static oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel.MEDIUM;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.normalization.domain.EvidenceDirection;
import oneuldo.behaviorlog.normalization.domain.EvidenceRole;
import oneuldo.behaviorlog.normalization.domain.EvidenceUse;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.IndependenceLevel;
import oneuldo.behaviorlog.normalization.domain.NormalizationFlag;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvidence;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorMeasurement;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEvidenceRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorMeasurementRepository;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.BehaviorPatternProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.EvidenceGap;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.EvidenceGapType;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ObservedEvidenceSummary;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SafetyProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SkillPerformanceProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SupportLevelObservation;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SupportProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.TrainingSessionObservation;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ValidityProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileEvidenceLink;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileGenerateRequest;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileResponse;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileEvidenceLinkRepository;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class BehaviorProfileService {

    public static final String PROFILE_VERSION = "behavior-profile-v1";
    public static final String PROFILE_POLICY_VERSION = "behavior-profile-policy-v1";
    private static final Instant MIN_EVIDENCE_TIME = Instant.parse("1970-01-01T00:00:00Z");
    private static final Set<String> HELP_EVENT_CODES = Set.of(
            "COMMON.HELP_REQUEST",
            "SHOP.STAFF_HELP_REQUESTED",
            "WORK.SUPERVISOR_HELP_REQUESTED",
            "LOST.HELP_REQUESTED"
    );

    private final MemberRepository memberRepository;
    private final NormalizedBehaviorEventRepository eventRepository;
    private final NormalizedBehaviorEvidenceRepository evidenceRepository;
    private final NormalizedBehaviorMeasurementRepository measurementRepository;
    private final BehaviorProfileSnapshotRepository snapshotRepository;
    private final BehaviorProfileEvidenceLinkRepository evidenceLinkRepository;

    @Transactional(readOnly = true)
    public Optional<BehaviorProfileResponse> latest(UUID memberId) {
        return snapshotRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId)
                .map(BehaviorProfileResponse::from);
    }

    @Transactional
    public BehaviorProfileResponse generate(UUID memberId, BehaviorProfileGenerateRequest request) {
        return generate(memberId, request, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public BehaviorProfileResponse generateForCompletedSession(UUID memberId, UUID sessionId) {
        return snapshotRepository.findByMemberIdAndSourceSessionId(memberId, sessionId)
                .map(BehaviorProfileResponse::from)
                .orElseGet(() -> generate(memberId, null, sessionId));
    }

    private BehaviorProfileResponse generate(UUID memberId, BehaviorProfileGenerateRequest request,
            UUID sourceSessionId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        Instant queryFrom = request == null || request.evidenceFrom() == null
                ? MIN_EVIDENCE_TIME : request.evidenceFrom();
        Instant queryTo = request == null || request.evidenceTo() == null
                ? Instant.now() : request.evidenceTo();
        if (queryFrom.isAfter(queryTo)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "evidenceFrom은 evidenceTo보다 늦을 수 없습니다.");
        }

        List<NormalizedBehaviorEvent> events = eventRepository.findProfileInputEvents(
                memberId,
                BehaviorNormalizationService.NORMALIZER_VERSION,
                BehaviorEventRegistry.REGISTRY_VERSION,
                BehaviorEventRegistry.MEASUREMENT_RULE_VERSION,
                queryFrom,
                queryTo
        );
        List<UUID> eventIds = events.stream().map(NormalizedBehaviorEvent::getId).toList();
        List<NormalizedBehaviorEvidence> evidence = eventIds.isEmpty()
                ? List.of() : evidenceRepository.findAllByNormalizedEventIdIn(eventIds);
        List<NormalizedBehaviorMeasurement> measurements = eventIds.isEmpty()
                ? List.of() : measurementRepository.findAllByNormalizedEventIdIn(eventIds);

        Instant evidenceFrom = request != null && request.evidenceFrom() != null
                ? request.evidenceFrom()
                : events.stream().map(NormalizedBehaviorEvent::getOccurredAt)
                        .min(Comparator.naturalOrder()).orElse(queryTo);
        Instant evidenceTo = request != null && request.evidenceTo() != null
                ? request.evidenceTo()
                : events.stream().map(NormalizedBehaviorEvent::getOccurredAt)
                        .max(Comparator.naturalOrder()).orElse(queryTo);
        Instant generatedAt = Instant.now();

        ProfileIndex index = new ProfileIndex(events, evidence, measurements);
        ValidityProfile validity = validityProfile(events);
        Map<String, SkillPerformanceProfile> skills = skillProfiles(index, validity);
        List<EvidenceGap> gaps = evidenceGaps(skills, index, validity);

        BehaviorProfileData data = new BehaviorProfileData(
                PROFILE_VERSION,
                PROFILE_POLICY_VERSION,
                BehaviorNormalizationService.NORMALIZER_VERSION,
                BehaviorEventRegistry.REGISTRY_VERSION,
                BehaviorEventRegistry.MEASUREMENT_RULE_VERSION,
                skills,
                supportProfile(index),
                trainingObservations(index),
                safetyProfile(events),
                validity,
                behaviorPatternProfile(index),
                gaps.stream().map(EvidenceGap::skillCode)
                        .collect(Collectors.toCollection(LinkedHashSet::new)),
                gaps,
                evidenceFrom,
                evidenceTo,
                generatedAt
        );

        BehaviorProfileSnapshot snapshot = snapshotRepository.save(
                new BehaviorProfileSnapshot(member, data, events.size(), sourceSessionId));
        evidenceLinkRepository.saveAll(createEvidenceLinks(snapshot, events, index));
        return BehaviorProfileResponse.from(snapshot);
    }

    @Transactional(readOnly = true)
    public BehaviorProfileResponse findLatest(UUID memberId) {
        return snapshotRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId)
                .map(BehaviorProfileResponse::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "생성된 행동 프로파일이 없습니다."));
    }

    private Map<String, SkillPerformanceProfile> skillProfiles(
            ProfileIndex index, ValidityProfile validity) {
        Map<String, SkillPerformanceProfile> result = new TreeMap<>();
        for (String skillCode : index.allSkillCodes()) {
            List<NormalizedBehaviorEvidence> assessment = index.evidenceBySkill(skillCode).stream()
                    .filter(item -> isAssessmentInput(item.getNormalizedEvent()))
                    .toList();
            List<NormalizedBehaviorEvidence> independent = assessment.stream()
                    .filter(item -> item.getNormalizedEvent().getIndependenceLevel()
                            == IndependenceLevel.INDEPENDENT)
                    .filter(this::isEvaluable)
                    .toList();
            List<NormalizedBehaviorEvidence> supported = assessment.stream()
                    .filter(item -> isSupported(item.getNormalizedEvent().getIndependenceLevel()))
                    .filter(this::isEvaluable)
                    .toList();
            int neutral = (int) assessment.stream()
                    .filter(item -> item.getDirection() == EvidenceDirection.NEUTRAL).count();
            Set<UUID> primary = eventIdsByRole(assessment, EvidenceRole.PRIMARY);
            Set<UUID> secondary = eventIdsByRole(assessment, EvidenceRole.SECONDARY);
            Set<TaskKey> tasks = assessment.stream()
                    .map(item -> TaskKey.from(item.getNormalizedEvent().getBehaviorLog()))
                    .collect(Collectors.toSet());
            int domains = (int) assessment.stream()
                    .map(item -> item.getNormalizedEvent().getDomain())
                    .filter(Objects::nonNull).distinct().count();
            int sessions = (int) assessment.stream()
                    .map(item -> item.getNormalizedEvent().getBehaviorLog().getSessionId())
                    .distinct().count();
            int evaluableCount = independent.size() + supported.size();
            ConfidenceLevel confidence = confidence(
                    evaluableCount, tasks.size(), domains, sessions, validity.excludedEventRate());
            List<ObservedEvidenceSummary> strengths = observedSummaries(
                    assessment, EvidenceDirection.POSITIVE, true);
            List<ObservedEvidenceSummary> difficulties = observedSummaries(
                    assessment, EvidenceDirection.NEGATIVE, false);

            result.put(skillCode, new SkillPerformanceProfile(
                    skillCode,
                    successRate(independent),
                    successRate(supported),
                    independent.size(),
                    supported.size(),
                    neutral,
                    primary.size(),
                    secondary.size(),
                    tasks.size(),
                    domains,
                    sessions,
                    confidence,
                    strengths,
                    difficulties,
                    interpretationLimits(evaluableCount, tasks.size(), sessions,
                            validity, assessment)
            ));
        }
        return Map.copyOf(result);
    }

    private List<ObservedEvidenceSummary> observedSummaries(
            List<NormalizedBehaviorEvidence> evidence,
            EvidenceDirection direction,
            boolean strength) {
        Map<SummaryKey, Long> counts = evidence.stream()
                .filter(item -> item.getDirection() == direction)
                .filter(item -> strength
                        ? item.getNormalizedEvent().getOutcome() == ObservedOutcome.SUCCESS
                        : item.getNormalizedEvent().getOutcome() == ObservedOutcome.FAILURE
                                || item.getNormalizedEvent().getOutcome() == ObservedOutcome.INCOMPLETE
                                || item.getDirection() == EvidenceDirection.NEGATIVE)
                .collect(Collectors.groupingBy(
                        item -> SummaryKey.from(item.getNormalizedEvent()),
                        Collectors.counting()));
        return counts.entrySet().stream()
                .filter(entry -> entry.getValue() >= 2)
                .sorted(Map.Entry.<SummaryKey, Long>comparingByValue().reversed()
                        .thenComparing(entry -> entry.getKey().eventCode()))
                .map(entry -> entry.getKey().toSummary(entry.getValue().intValue()))
                .toList();
    }

    private List<String> interpretationLimits(int evaluableCount, int taskCount, int sessionCount,
            ValidityProfile validity, List<NormalizedBehaviorEvidence> assessment) {
        List<String> limits = new ArrayList<>();
        if (evaluableCount == 0) limits.add("평가 가능한 근거가 없습니다.");
        else if (evaluableCount < 5) limits.add("평가 가능한 근거가 5개 미만입니다.");
        if (taskCount == 1) limits.add("근거가 하나의 과제에만 집중되어 있습니다.");
        if (sessionCount == 1) limits.add("근거가 하나의 완료 세션에만 있습니다.");
        if (validity.excludedEventRate() != null && validity.excludedEventRate() > 15.0) {
            limits.add("전체 이벤트 제외율이 15%를 초과합니다.");
        }
        if (validity.gappedSessionCount() > 0) limits.add("순번 누락 세션이 존재합니다.");
        boolean singleOnly = assessment.stream()
                .collect(Collectors.groupingBy(
                        item -> SummaryKey.from(item.getNormalizedEvent()), Collectors.counting()))
                .values().stream().allMatch(count -> count == 1);
        if (!assessment.isEmpty() && singleOnly) limits.add("반복 확인된 행동 근거가 없습니다.");
        return List.copyOf(limits);
    }

    private SupportProfile supportProfile(ProfileIndex index) {
        List<NormalizedBehaviorEvidence> evidence = index.evidence().stream()
                .filter(item -> isAssessmentOrTrainingInput(item.getNormalizedEvent()))
                .toList();
        List<SupportLevelObservation> levels = new ArrayList<>();
        for (IndependenceLevel level : IndependenceLevel.values()) {
            List<NormalizedBehaviorEvidence> levelEvidence = evidence.stream()
                    .filter(item -> item.getNormalizedEvent().getIndependenceLevel() == level)
                    .filter(this::isEvaluable).toList();
            if (!levelEvidence.isEmpty()) {
                levels.add(new SupportLevelObservation(
                        level, levelEvidence.size(), successRate(levelEvidence)));
            }
        }
        List<NormalizedBehaviorEvent> events = index.events().stream()
                .filter(this::isAssessmentOrTrainingInput).toList();
        List<NormalizedBehaviorMeasurement> promptLevels = sessionSnapshots(
                index.measurementsFor(events), "promptLevel");
        List<NormalizedBehaviorMeasurement> supportCounts = sessionSnapshots(
                index.measurementsFor(events), "supportCountSnapshot");
        List<Long> helpLatencies = numericValues(
                index.measurementsFor(events), "helpRequestLatencyMs").stream()
                .map(BigDecimal::longValue).toList();
        int supportedSessions = (int) events.stream()
                .filter(event -> isSupported(event.getIndependenceLevel()))
                .map(event -> event.getBehaviorLog().getSessionId()).distinct().count();
        return new SupportProfile(
                List.copyOf(levels),
                averageDecimals(numericValues(promptLevels)),
                sumAsInteger(numericValues(supportCounts)),
                medianLong(helpLatencies),
                supportedSessions
        );
    }

    private List<TrainingSessionObservation> trainingObservations(ProfileIndex index) {
        Map<TrainingKey, List<NormalizedBehaviorEvent>> groups = index.events().stream()
                .filter(this::isTrainingInput)
                .collect(Collectors.groupingBy(
                        event -> TrainingKey.from(event.getBehaviorLog()), LinkedHashMap::new,
                        Collectors.toList()));
        List<TrainingSessionObservation> result = new ArrayList<>();
        for (Map.Entry<TrainingKey, List<NormalizedBehaviorEvent>> entry : groups.entrySet()) {
            List<NormalizedBehaviorEvent> events = entry.getValue();
            Set<UUID> ids = events.stream().map(NormalizedBehaviorEvent::getId).collect(Collectors.toSet());
            List<NormalizedBehaviorEvidence> evidence = index.evidence().stream()
                    .filter(item -> ids.contains(item.getNormalizedEvent().getId()))
                    .filter(this::isEvaluable).toList();
            List<NormalizedBehaviorMeasurement> eventMeasurements = index.measurementsFor(events);
            List<NormalizedBehaviorMeasurement> supportCounts = sessionSnapshots(
                    eventMeasurements, "supportCountSnapshot");
            List<NormalizedBehaviorMeasurement> promptLevels = sessionSnapshots(
                    eventMeasurements, "promptLevel");
            BehaviorLog first = events.getFirst().getBehaviorLog();
            result.add(new TrainingSessionObservation(
                    entry.getKey().sessionId(),
                    entry.getKey().taskId(),
                    entry.getKey().taskVersion(),
                    first.getDifficulty(),
                    first.getScenarioVariant(),
                    events.stream().map(NormalizedBehaviorEvent::getOccurredAt)
                            .min(Comparator.naturalOrder()).orElseThrow(),
                    events.stream().map(NormalizedBehaviorEvent::getOccurredAt)
                            .max(Comparator.naturalOrder()).orElseThrow(),
                    evidence.size(),
                    successRate(evidence),
                    sumAsInteger(numericValues(supportCounts)),
                    averageDecimals(numericValues(promptLevels))
            ));
        }
        return result.stream()
                .sorted(Comparator.comparing((TrainingSessionObservation item) -> item.taskId().toString())
                        .thenComparing(TrainingSessionObservation::taskVersion)
                        .thenComparing(TrainingSessionObservation::endedAt))
                .toList();
    }

    private SafetyProfile safetyProfile(List<NormalizedBehaviorEvent> events) {
        List<NormalizedBehaviorEvent> safetyEvents = events.stream()
                .filter(this::isValidComplete)
                .filter(event -> event.getEvidenceUse() == EvidenceUse.SAFETY_ONLY
                        || event.getSafetyStatus() != null)
                .toList();
        int red = (int) safetyEvents.stream()
                .filter(event -> event.getSafetyStatus() == SafetyStatus.RED).count();
        int yellow = (int) safetyEvents.stream()
                .filter(event -> event.getSafetyStatus() == SafetyStatus.YELLOW).count();
        int nearMiss = (int) safetyEvents.stream()
                .filter(event -> event.getFlags().contains(NormalizationFlag.NEAR_MISS)).count();
        Map<String, Long> codeCounts = safetyEvents.stream()
                .collect(Collectors.groupingBy(
                        NormalizedBehaviorEvent::getSourceEventCode, Collectors.counting()));
        List<String> repeatedCodes = codeCounts.entrySet().stream()
                .filter(entry -> entry.getValue() >= 2).map(Map.Entry::getKey).sorted().toList();
        boolean repeatedYellow = safetyEvents.stream()
                .filter(event -> event.getSafetyStatus() == SafetyStatus.YELLOW)
                .collect(Collectors.groupingBy(
                        NormalizedBehaviorEvent::getSourceEventCode, Collectors.counting()))
                .values().stream().anyMatch(count -> count >= 2);
        SafetyStatus overall = safetyEvents.stream()
                .map(NormalizedBehaviorEvent::getSafetyStatus).filter(Objects::nonNull)
                .max(Comparator.comparingInt(this::safetyRank)).orElse(null);
        return new SafetyProfile(overall, red, yellow, nearMiss,
                repeatedCodes, red > 0 || repeatedYellow);
    }

    private ValidityProfile validityProfile(List<NormalizedBehaviorEvent> events) {
        int valid = (int) events.stream()
                .filter(event -> event.getNormalizationStatus() == NormalizationStatus.NORMALIZED)
                .filter(event -> event.getValidityStatus() == ValidityStatus.VALID).count();
        int invalid = (int) events.stream()
                .filter(event -> event.getNormalizationStatus() == NormalizationStatus.NORMALIZED)
                .filter(event -> event.getValidityStatus() != ValidityStatus.VALID).count();
        int quarantined = (int) events.stream()
                .filter(event -> event.getNormalizationStatus() == NormalizationStatus.QUARANTINED)
                .count();
        Map<ValidityStatus, Integer> statusCounts = new EnumMap<>(ValidityStatus.class);
        events.forEach(event -> statusCounts.merge(event.getValidityStatus(), 1, Integer::sum));
        Map<String, Integer> issueCounts = new TreeMap<>();
        events.stream().flatMap(event -> event.getNormalizationIssues().stream())
                .forEach(issue -> issueCounts.merge(issue.issueCode(), 1, Integer::sum));
        Map<UUID, SessionIntegrityStatus> sessions = new HashMap<>();
        events.stream().filter(event -> event.getSessionIntegrity() != null)
                .forEach(event -> sessions.put(
                        event.getSessionIntegrity().getId(), event.getSessionIntegrity().getStatus()));
        int open = (int) sessions.values().stream()
                .filter(status -> status == SessionIntegrityStatus.OPEN
                        || status == SessionIntegrityStatus.OPEN_WITH_GAPS).count();
        int gapped = (int) sessions.values().stream()
                .filter(status -> status == SessionIntegrityStatus.GAPPED).count();
        Double excludedRate = events.isEmpty() ? null
                : percentage(invalid + quarantined, events.size());
        return new ValidityProfile(valid, invalid, quarantined,
                Map.copyOf(statusCounts), Map.copyOf(issueCounts), open, gapped, excludedRate);
    }

    private BehaviorPatternProfile behaviorPatternProfile(ProfileIndex index) {
        List<NormalizedBehaviorEvent> events = index.events().stream()
                .filter(this::isValidComplete).toList();
        List<NormalizedBehaviorEvent> errorEvents = events.stream()
                .filter(event -> event.getErrorType() != null && event.getErrorType() != ErrorType.NONE)
                .toList();
        long corrected = errorEvents.stream()
                .filter(event -> event.getFlags().contains(NormalizationFlag.SELF_CORRECTED)).count();
        long repeated = errorEvents.stream()
                .filter(event -> event.getErrorType() == ErrorType.REPETITION).count();
        int help = (int) events.stream()
                .filter(event -> HELP_EVENT_CODES.contains(event.getSourceEventCode())).count();
        List<NormalizedBehaviorMeasurement> measurements = index.measurementsFor(events);
        Map<String, Double> pathEfficiency = measurements.stream()
                .filter(item -> item.getMetricCode().equals("pathEfficiency"))
                .filter(item -> item.getNumericValue() != null)
                .collect(Collectors.groupingBy(
                        item -> item.getNormalizedEvent().getBehaviorLog().getTaskVersion(),
                        TreeMap::new,
                        Collectors.averagingDouble(item -> item.getNumericValue().doubleValue())));
        return new BehaviorPatternProfile(
                errorEvents.isEmpty() ? null : percentage(corrected, errorEvents.size()),
                errorEvents.isEmpty() ? null : percentage(repeated, errorEvents.size()),
                help,
                medianLong(numericValues(measurements, "helpRequestLatencyMs").stream()
                        .map(BigDecimal::longValue).toList()),
                medianLong(numericValues(measurements, "startLatencyMs").stream()
                        .map(BigDecimal::longValue).toList()),
                Map.copyOf(pathEfficiency)
        );
    }

    private List<EvidenceGap> evidenceGaps(Map<String, SkillPerformanceProfile> skills,
            ProfileIndex index, ValidityProfile validity) {
        List<EvidenceGap> gaps = new ArrayList<>();
        for (SkillPerformanceProfile skill : skills.values()) {
            int evaluable = skill.independentEvaluableEvidenceCount()
                    + skill.supportedEvaluableEvidenceCount();
            if (evaluable == 0) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.NO_ASSESSMENT_EVIDENCE,
                        "평가 가능한 독립 또는 지원 근거가 없습니다.",
                        "완료된 평가 과제에서 긍정 또는 부정 근거를 수집합니다."));
            } else if (evaluable < 5) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.INSUFFICIENT_EVIDENCE,
                        "평가 가능한 근거가 5개 미만입니다.",
                        "동일 기술을 관찰하는 평가 근거를 추가합니다."));
            }
            if (evaluable > 0 && skill.distinctTaskCount() == 1) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.SINGLE_TASK_ONLY,
                        "근거가 한 과제에만 있습니다.",
                        "다른 과제에서 같은 기술을 관찰합니다."));
            }
            if (evaluable > 0 && skill.distinctSessionCount() == 1) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.SINGLE_SESSION_ONLY,
                        "근거가 한 완료 세션에만 있습니다.",
                        "다른 완료 세션에서 반복 관찰합니다."));
            }
            List<NormalizedBehaviorEvidence> assessment = index.evidenceBySkill(skill.skillCode())
                    .stream().filter(item -> isAssessmentInput(item.getNormalizedEvent()))
                    .filter(this::isEvaluable).toList();
            boolean positive = assessment.stream()
                    .anyMatch(item -> item.getDirection() == EvidenceDirection.POSITIVE);
            boolean negative = assessment.stream()
                    .anyMatch(item -> item.getDirection() == EvidenceDirection.NEGATIVE);
            if (positive && negative) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.CONFLICTING_RESULTS,
                        "긍정 근거와 부정 근거가 함께 관찰되었습니다.",
                        "같은 난이도와 조건에서 반복 평가합니다."));
            }
            if (validity.excludedEventRate() != null && validity.excludedEventRate() > 15.0) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.HIGH_EXCLUSION_RATE,
                        "전체 이벤트 제외율이 15%를 초과합니다.",
                        "접근성 및 기술 오류를 해결한 뒤 다시 수집합니다."));
            }
            if (validity.gappedSessionCount() > 0) {
                gaps.add(gap(skill.skillCode(), EvidenceGapType.SESSION_INTEGRITY_PROBLEM,
                        "순번 누락 세션이 존재합니다.",
                        "완전한 이벤트 순번을 가진 세션을 추가로 수집합니다."));
            }
        }
        return List.copyOf(gaps);
    }

    private EvidenceGap gap(String skillCode, EvidenceGapType type,
            String reason, String recommendedEvidence) {
        return new EvidenceGap(skillCode, type, reason, recommendedEvidence);
    }

    private List<BehaviorProfileEvidenceLink> createEvidenceLinks(
            BehaviorProfileSnapshot snapshot, List<NormalizedBehaviorEvent> events,
            ProfileIndex index) {
        List<BehaviorProfileEvidenceLink> links = new ArrayList<>();
        for (NormalizedBehaviorEvent event : events) {
            boolean included = isProfileInput(event);
            String reason = included ? null : exclusionReason(event);
            List<NormalizedBehaviorEvidence> eventEvidence = index.evidenceByEvent(event.getId());
            if (eventEvidence.isEmpty()) {
                links.add(new BehaviorProfileEvidenceLink(snapshot, event, null, included, reason));
            } else {
                eventEvidence.stream().map(NormalizedBehaviorEvidence::getSkillCode).distinct()
                        .forEach(skillCode -> links.add(new BehaviorProfileEvidenceLink(
                                snapshot, event, skillCode, included, reason)));
            }
        }
        return links;
    }

    private String exclusionReason(NormalizedBehaviorEvent event) {
        if (event.getNormalizationStatus() == NormalizationStatus.QUARANTINED) return "QUARANTINED";
        if (event.getNormalizationStatus() != NormalizationStatus.NORMALIZED) return "NORMALIZATION_FAILED";
        if (event.getValidityStatus() != ValidityStatus.VALID) return event.getValidityStatus().name();
        if (event.getSessionIntegrity() == null) return "MISSING_SESSION_INTEGRITY";
        if (event.getSessionIntegrity().getStatus() != SessionIntegrityStatus.COMPLETE) {
            return "SESSION_" + event.getSessionIntegrity().getStatus().name();
        }
        return "EVIDENCE_EXCLUDED";
    }

    private boolean isProfileInput(NormalizedBehaviorEvent event) {
        return isValidComplete(event) && event.getEvidenceUse() != EvidenceUse.EXCLUDED;
    }

    private boolean isValidComplete(NormalizedBehaviorEvent event) {
        return event.getNormalizationStatus() == NormalizationStatus.NORMALIZED
                && event.getValidityStatus() == ValidityStatus.VALID
                && event.getSessionIntegrity() != null
                && event.getSessionIntegrity().getStatus() == SessionIntegrityStatus.COMPLETE;
    }

    private boolean isAssessmentInput(NormalizedBehaviorEvent event) {
        return isValidComplete(event) && event.getEvidenceUse() == EvidenceUse.ASSESSMENT_PRIMARY;
    }

    private boolean isTrainingInput(NormalizedBehaviorEvent event) {
        return isValidComplete(event) && event.getEvidenceUse() == EvidenceUse.TRAINING_PROGRESS;
    }

    private boolean isAssessmentOrTrainingInput(NormalizedBehaviorEvent event) {
        return isValidComplete(event) && (event.getEvidenceUse() == EvidenceUse.ASSESSMENT_PRIMARY
                || event.getEvidenceUse() == EvidenceUse.TRAINING_PROGRESS);
    }

    private boolean isSupported(IndependenceLevel level) {
        return level == IndependenceLevel.SUPPORTED_LEVEL_1
                || level == IndependenceLevel.SUPPORTED_LEVEL_2
                || level == IndependenceLevel.SUPPORTED_LEVEL_3;
    }

    private boolean isEvaluable(NormalizedBehaviorEvidence evidence) {
        return evidence.getDirection() == EvidenceDirection.POSITIVE
                || evidence.getDirection() == EvidenceDirection.NEGATIVE;
    }

    private Set<UUID> eventIdsByRole(List<NormalizedBehaviorEvidence> evidence, EvidenceRole role) {
        return evidence.stream().filter(item -> item.getEvidenceRole() == role)
                .map(item -> item.getNormalizedEvent().getId()).collect(Collectors.toSet());
    }

    private Double successRate(List<NormalizedBehaviorEvidence> evidence) {
        if (evidence.isEmpty()) return null;
        long positive = evidence.stream()
                .filter(item -> item.getDirection() == EvidenceDirection.POSITIVE).count();
        return percentage(positive, evidence.size());
    }

    private ConfidenceLevel confidence(int evidenceCount, int taskCount, int domainCount,
            int sessionCount, Double excludedRate) {
        if (evidenceCount == 0) return INSUFFICIENT;
        if (evidenceCount >= 10 && taskCount >= 3 && domainCount >= 2 && sessionCount >= 3
                && excludedRate != null && excludedRate <= 15.0) return HIGH;
        if (evidenceCount >= 5 && taskCount >= 2 && sessionCount >= 2) return MEDIUM;
        return LOW;
    }

    private List<NormalizedBehaviorMeasurement> sessionSnapshots(
            List<NormalizedBehaviorMeasurement> measurements, String metricCode) {
        Map<UUID, NormalizedBehaviorMeasurement> lastBySession = new HashMap<>();
        measurements.stream()
                .filter(item -> item.getMetricCode().equals(metricCode))
                .filter(item -> item.getNumericValue() != null)
                .forEach(item -> lastBySession.merge(
                        item.getNormalizedEvent().getBehaviorLog().getSessionId(), item,
                        (left, right) -> left.getNormalizedEvent().getBehaviorLog().getEventSequence()
                                >= right.getNormalizedEvent().getBehaviorLog().getEventSequence()
                                ? left : right));
        return List.copyOf(lastBySession.values());
    }

    private List<BigDecimal> numericValues(List<NormalizedBehaviorMeasurement> measurements) {
        return measurements.stream().map(NormalizedBehaviorMeasurement::getNumericValue)
                .filter(Objects::nonNull).toList();
    }

    private List<BigDecimal> numericValues(
            List<NormalizedBehaviorMeasurement> measurements, String metricCode) {
        return measurements.stream().filter(item -> item.getMetricCode().equals(metricCode))
                .map(NormalizedBehaviorMeasurement::getNumericValue)
                .filter(Objects::nonNull).toList();
    }

    private Double averageDecimals(List<BigDecimal> values) {
        if (values.isEmpty()) return null;
        BigDecimal sum = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(values.size()), 2, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private Integer sumAsInteger(List<BigDecimal> values) {
        if (values.isEmpty()) return null;
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add).intValue();
    }

    private Long medianLong(List<Long> values) {
        if (values.isEmpty()) return null;
        List<Long> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 1) return sorted.get(middle);
        return BigDecimal.valueOf(sorted.get(middle - 1))
                .add(BigDecimal.valueOf(sorted.get(middle)))
                .divide(BigDecimal.TWO, 0, RoundingMode.HALF_UP).longValue();
    }

    private Double percentage(long numerator, long denominator) {
        if (denominator == 0) return null;
        return BigDecimal.valueOf(numerator)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(denominator), 2, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private int safetyRank(SafetyStatus status) {
        return switch (status) {
            case GREEN -> 0;
            case YELLOW -> 1;
            case RED -> 2;
        };
    }

    private record TaskKey(UUID taskId, String taskVersion) {
        static TaskKey from(BehaviorLog log) {
            return new TaskKey(log.getTaskId(), log.getTaskVersion());
        }
    }

    private record TrainingKey(UUID sessionId, UUID taskId, String taskVersion) {
        static TrainingKey from(BehaviorLog log) {
            return new TrainingKey(log.getSessionId(), log.getTaskId(), log.getTaskVersion());
        }
    }

    private record SummaryKey(String eventCode, ObservedOutcome outcome,
            IndependenceLevel independenceLevel, ErrorType errorType) {
        static SummaryKey from(NormalizedBehaviorEvent event) {
            return new SummaryKey(event.getSourceEventCode(), event.getOutcome(),
                    event.getIndependenceLevel(), event.getErrorType());
        }

        ObservedEvidenceSummary toSummary(int count) {
            return new ObservedEvidenceSummary(
                    eventCode, outcome, independenceLevel, errorType, count);
        }
    }

    private static final class ProfileIndex {
        private final List<NormalizedBehaviorEvent> events;
        private final List<NormalizedBehaviorEvidence> evidence;
        private final Map<UUID, List<NormalizedBehaviorEvidence>> evidenceByEvent;
        private final Map<String, List<NormalizedBehaviorEvidence>> evidenceBySkill;
        private final Map<UUID, List<NormalizedBehaviorMeasurement>> measurementsByEvent;

        private ProfileIndex(List<NormalizedBehaviorEvent> events,
                List<NormalizedBehaviorEvidence> evidence,
                List<NormalizedBehaviorMeasurement> measurements) {
            this.events = List.copyOf(events);
            this.evidence = List.copyOf(evidence);
            this.evidenceByEvent = evidence.stream().collect(Collectors.groupingBy(
                    item -> item.getNormalizedEvent().getId()));
            this.evidenceBySkill = evidence.stream().collect(Collectors.groupingBy(
                    NormalizedBehaviorEvidence::getSkillCode));
            this.measurementsByEvent = measurements.stream().collect(Collectors.groupingBy(
                    item -> item.getNormalizedEvent().getId()));
        }

        List<NormalizedBehaviorEvent> events() { return events; }
        List<NormalizedBehaviorEvidence> evidence() { return evidence; }
        Set<String> allSkillCodes() { return new HashSet<>(evidenceBySkill.keySet()); }
        List<NormalizedBehaviorEvidence> evidenceBySkill(String skillCode) {
            return evidenceBySkill.getOrDefault(skillCode, List.of());
        }
        List<NormalizedBehaviorEvidence> evidenceByEvent(UUID eventId) {
            return evidenceByEvent.getOrDefault(eventId, List.of());
        }
        List<NormalizedBehaviorMeasurement> measurementsFor(
                List<NormalizedBehaviorEvent> selectedEvents) {
            return selectedEvents.stream()
                    .flatMap(event -> measurementsByEvent.getOrDefault(
                            event.getId(), List.of()).stream())
                    .toList();
        }
    }
}
