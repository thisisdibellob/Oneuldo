package oneuldo.behaviorlog.profile.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.domain.BehaviorSessionIntegrity;
import oneuldo.behaviorlog.normalization.domain.EvidenceDirection;
import oneuldo.behaviorlog.normalization.domain.EvidenceRole;
import oneuldo.behaviorlog.normalization.domain.EvidenceUse;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.IndependenceLevel;
import oneuldo.behaviorlog.normalization.domain.NormalizationStatus;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvent;
import oneuldo.behaviorlog.normalization.domain.NormalizedBehaviorEvidence;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEvidenceRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorMeasurementRepository;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileGenerateRequest;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileEvidenceLinkRepository;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class BehaviorProfileServiceTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final NormalizedBehaviorEventRepository eventRepository =
            mock(NormalizedBehaviorEventRepository.class);
    private final NormalizedBehaviorEvidenceRepository evidenceRepository =
            mock(NormalizedBehaviorEvidenceRepository.class);
    private final NormalizedBehaviorMeasurementRepository measurementRepository =
            mock(NormalizedBehaviorMeasurementRepository.class);
    private final BehaviorProfileSnapshotRepository snapshotRepository =
            mock(BehaviorProfileSnapshotRepository.class);
    private final BehaviorProfileEvidenceLinkRepository evidenceLinkRepository =
            mock(BehaviorProfileEvidenceLinkRepository.class);

    private BehaviorProfileService service;
    private UUID memberId;

    @BeforeEach
    void setUp() {
        service = new BehaviorProfileService(
                memberRepository,
                eventRepository,
                evidenceRepository,
                measurementRepository,
                snapshotRepository,
                evidenceLinkRepository
        );
        memberId = UUID.randomUUID();
        when(memberRepository.findById(memberId)).thenReturn(java.util.Optional.of(mock(Member.class)));
        when(snapshotRepository.save(any(BehaviorProfileSnapshot.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceLinkRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(measurementRepository.findAllByNormalizedEventIdIn(anyList())).thenReturn(List.of());
    }

    @Test
    void createsSkillRatesAndRepeatedEvidenceSummaryFromCompletedAssessmentEvents() {
        NormalizedBehaviorEvent first = event(
                IndependenceLevel.INDEPENDENT, ObservedOutcome.SUCCESS, 1);
        NormalizedBehaviorEvent second = event(
                IndependenceLevel.INDEPENDENT, ObservedOutcome.SUCCESS, 2);
        NormalizedBehaviorEvent supported = event(
                IndependenceLevel.SUPPORTED_LEVEL_1, ObservedOutcome.FAILURE, 3);

        when(eventRepository.findProfileInputEvents(eq(memberId), any(), any(), any(), any(), any()))
                .thenReturn(List.of(first, second, supported));
        List<NormalizedBehaviorEvidence> evidence = List.of(
                evidence(first, EvidenceDirection.POSITIVE),
                evidence(second, EvidenceDirection.POSITIVE),
                evidence(supported, EvidenceDirection.NEGATIVE)
        );
        when(evidenceRepository.findAllByNormalizedEventIdIn(anyList())).thenReturn(evidence);

        var response = service.generate(memberId, null);
        var skill = response.profileData().skills().get("EXECUTIVE_FUNCTION");

        assertThat(skill.independentSuccessRate()).isEqualTo(100.0);
        assertThat(skill.supportedSuccessRate()).isEqualTo(0.0);
        assertThat(skill.independentEvaluableEvidenceCount()).isEqualTo(2);
        assertThat(skill.supportedEvaluableEvidenceCount()).isEqualTo(1);
        assertThat(skill.observedStrengths()).hasSize(1);
        assertThat(skill.observedStrengths().getFirst().observationCount()).isEqualTo(2);
        assertThat(response.profileData().needsMoreAssessment())
                .contains("EXECUTIVE_FUNCTION");
        assertThat(response.inputEventCount()).isEqualTo(3);
    }

    @Test
    void createsEmptyProfileWithoutReplacingMissingRatesWithZero() {
        when(eventRepository.findProfileInputEvents(eq(memberId), any(), any(), any(), any(), any()))
                .thenReturn(List.of());

        var response = service.generate(memberId, null);

        assertThat(response.profileData().skills()).isEmpty();
        assertThat(response.profileData().validityProfile().excludedEventRate()).isNull();
        assertThat(response.profileData().behaviorPatternProfile().selfCorrectionRate()).isNull();
        assertThat(response.profileData().behaviorPatternProfile().shoppingSessions()).isEmpty();
    }

    @Test
    void rejectsReversedEvidencePeriod() {
        Instant now = Instant.now();
        var request = new BehaviorProfileGenerateRequest(now, now.minusSeconds(1));

        assertThatThrownBy(() -> service.generate(memberId, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("evidenceFrom");
    }

    private NormalizedBehaviorEvent event(
            IndependenceLevel independence, ObservedOutcome outcome, long sequence) {
        UUID eventId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        NormalizedBehaviorEvent event = mock(NormalizedBehaviorEvent.class);
        BehaviorLog log = mock(BehaviorLog.class);
        BehaviorSessionIntegrity integrity = mock(BehaviorSessionIntegrity.class);
        when(event.getId()).thenReturn(eventId);
        when(event.getBehaviorLog()).thenReturn(log);
        when(event.getSessionIntegrity()).thenReturn(integrity);
        when(event.getNormalizationStatus()).thenReturn(NormalizationStatus.NORMALIZED);
        when(event.getValidityStatus()).thenReturn(ValidityStatus.VALID);
        when(event.getEvidenceUse()).thenReturn(EvidenceUse.ASSESSMENT_PRIMARY);
        when(event.getIndependenceLevel()).thenReturn(independence);
        when(event.getOutcome()).thenReturn(outcome);
        when(event.getErrorType()).thenReturn(
                outcome == ObservedOutcome.FAILURE ? ErrorType.WRONG_SELECTION : ErrorType.NONE);
        when(event.getDomain()).thenReturn(BehaviorDomain.SHOPPING);
        when(event.getSourceEventCode()).thenReturn(
                outcome == ObservedOutcome.SUCCESS ? "SHOP.ITEM_SELECTED" : "SHOP.WRONG_ITEM_SELECTED");
        when(event.getOccurredAt()).thenReturn(Instant.parse("2026-01-01T00:00:00Z").plusSeconds(sequence));
        when(event.getFlags()).thenReturn(Set.of());
        when(event.getNormalizationIssues()).thenReturn(List.of());
        when(integrity.getId()).thenReturn(sessionId);
        when(integrity.getStatus()).thenReturn(SessionIntegrityStatus.COMPLETE);
        when(log.getSessionId()).thenReturn(sessionId);
        when(log.getTaskId()).thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        when(log.getTaskVersion()).thenReturn("task-v1");
        when(log.getEventSequence()).thenReturn(sequence);
        return event;
    }

    private NormalizedBehaviorEvidence evidence(
            NormalizedBehaviorEvent event, EvidenceDirection direction) {
        NormalizedBehaviorEvidence evidence = mock(NormalizedBehaviorEvidence.class);
        when(evidence.getNormalizedEvent()).thenReturn(event);
        when(evidence.getSkillCode()).thenReturn("EXECUTIVE_FUNCTION");
        when(evidence.getDirection()).thenReturn(direction);
        when(evidence.getEvidenceRole()).thenReturn(EvidenceRole.PRIMARY);
        return evidence;
    }
}
