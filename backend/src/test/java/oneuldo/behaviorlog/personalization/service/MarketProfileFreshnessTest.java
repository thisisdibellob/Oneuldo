package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.*;
import oneuldo.behaviorlog.analysis.service.AnalysisJobService;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.personalization.controller.MarketProfileReadinessExceptionHandler;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MarketProfileFreshnessTest {
    private final UUID member = UUID.randomUUID(), session = UUID.randomUUID(), dataset = UUID.randomUUID(), analysisId = UUID.randomUUID(), eventId = UUID.randomUUID();
    private final BehaviorLogRepository logs = mock(BehaviorLogRepository.class);
    private final AiUserProfileService profiles = mock(AiUserProfileService.class);
    private final AiUserProfileRepository profileRepository = mock(AiUserProfileRepository.class);
    private final AnalysisJobService jobs = mock(AnalysisJobService.class);
    private final AiBehaviorAnalysisRepository analyses = mock(AiBehaviorAnalysisRepository.class);
    private final BehaviorAnalysisInputSnapshotRepository snapshots = mock(BehaviorAnalysisInputSnapshotRepository.class);
    private final MarketProfileFreshnessService service = new MarketProfileFreshnessService(logs, profiles, profileRepository, jobs, analyses, snapshots);
    private final AiUserProfileResponse profile = mock(AiUserProfileResponse.class);

    @BeforeEach void readySynchronousProfile() {
        var submitted = mock(BehaviorLog.class);
        when(submitted.getId()).thenReturn(eventId);
        when(submitted.getSessionId()).thenReturn(session);
        when(logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member, List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"))).thenReturn(Optional.of(submitted));
        when(profiles.current(member)).thenReturn(Optional.of(profile));
        when(profile.sourceSessionId()).thenReturn(session);
        when(profile.profileId()).thenReturn(UUID.randomUUID());
        when(profile.sourceDatasetId()).thenReturn(dataset);
        when(profile.sourceAnalysisId()).thenReturn(analysisId);
        when(profile.createdAt()).thenReturn(Instant.EPOCH);
        when(profile.promptVersion()).thenReturn(oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory.VERSION);
        when(profileRepository.findFirstByMemberIdAndSourceSessionIdOrderByCreatedAtDesc(member, session)).thenReturn(Optional.empty());
        var analysis = mock(AiBehaviorAnalysisRun.class);
        when(analysis.getStatus()).thenReturn("READY");
        when(analysis.getDatasetId()).thenReturn(dataset);
        when(analyses.findByIdAndMemberId(analysisId, member)).thenReturn(Optional.of(analysis));
        snapshotWithSubmission(eventId);
    }

    private void snapshotWithSubmission(UUID includedEvent) {
        var event = mock(BehaviorAnalysisInput.EventTimeline.class);
        when(event.behaviorLogId()).thenReturn(includedEvent);
        var snapshot = mock(BehaviorAnalysisInputSnapshot.class);
        when(snapshot.getInputData()).thenReturn(new BehaviorAnalysisInput("test", dataset, Instant.now(), null, "anonymous", 1, 1,
                List.of(new BehaviorAnalysisInput.SessionTimeline(session, null, null, null, List.of(event)))));
        when(snapshots.findByIdAndMemberId(dataset, member)).thenReturn(Optional.of(snapshot));
    }

    private AnalysisJobService.Job job(String status, String stage, UUID jobDataset, UUID jobAnalysis) {
        return new AnalysisJobService.Job(UUID.randomUUID(), session, jobDataset, status, stage, 0, 0,
                null, jobAnalysis, null, Instant.now(), Instant.now());
    }

    private void expectReadiness(boolean pending, String stage) {
        assertThatThrownBy(() -> service.requireCurrent(member)).isInstanceOfSatisfying(MarketProfileReadinessException.class, e -> {
            assertThat(e.pending()).isEqualTo(pending);
            assertThat(e.stage()).isEqualTo(stage);
        });
    }

    @Test void firstPlayKeepsExistingNoSubmissionPath() {
        when(logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member, List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"))).thenReturn(Optional.empty());
        when(profiles.requireCurrent(member)).thenReturn(profile);
        assertThat(service.requireCurrent(member)).isSameAs(profile);
        verifyNoInteractions(jobs, profileRepository);
    }

    private void noSubmittedPlayAndNoReadyProfile() {
        when(logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member, List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"))).thenReturn(Optional.empty());
        when(profiles.current(member)).thenReturn(Optional.empty());
    }

    @Test void firstMemberWithoutAnyAnalysisOrProfileGetsOnlyTheExplicitBaselineSignal() {
        noSubmittedPlayAndNoReadyProfile();
        assertThatThrownBy(() -> service.requireCurrent(member)).isInstanceOf(MarketBaselineRequiredException.class);
        var response = new MarketProfileReadinessExceptionHandler().baseline(new MarketBaselineRequiredException());
        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody().code()).isEqualTo("MARKET_BASELINE_REQUIRED");
        assertThat(response.getBody().stage()).isEqualTo("FIRST_PLAY");
        assertThat(response.getBody().source()).isEqualTo("STATIC");
        assertThat(response.getBody().availability().submittedPlayAvailable()).isFalse();
        assertThat(response.getBody().availability().readyProfileAvailable()).isFalse();
        verify(profiles, never()).requireCurrent(any());
    }

    @Test void firstSubmissionAbsenceDoesNotHideActiveOrFailedJobs() {
        noSubmittedPlayAndNoReadyProfile();
        for (String status : List.of("QUEUED", "RUNNING")) {
            when(jobs.current(member)).thenReturn(job(status, "OBSERVATION", dataset, analysisId));
            expectReadiness(true, "OBSERVATION");
        }
        when(jobs.current(member)).thenReturn(job("FAILED", "FAILED", dataset, analysisId));
        expectReadiness(false, "FAILED");
        when(jobs.current(member)).thenReturn(job("READY", "READY", dataset, analysisId));
        expectReadiness(true, "PROFILE");
    }

    @Test void noReadyProfileDoesNotHideFailedProfileOrReadyAnalysisAwaitingAProfile() {
        noSubmittedPlayAndNoReadyProfile();
        var failedProfile = mock(AiUserProfile.class);
        when(failedProfile.getStatus()).thenReturn("FAILED");
        when(profileRepository.findFirstByMemberIdOrderByCreatedAtDesc(member)).thenReturn(Optional.of(failedProfile));
        expectReadiness(false, "PROFILE");
        when(profileRepository.findFirstByMemberIdOrderByCreatedAtDesc(member)).thenReturn(Optional.empty());
        var run = mock(AiBehaviorAnalysisRun.class);
        when(analyses.findFirstByMemberIdAndStatusNotOrderByCreatedAtDesc(member, "NO_HISTORY")).thenReturn(Optional.of(run));
        when(run.getStatus()).thenReturn("FAILED");
        expectReadiness(false, "ANALYSIS");
        when(run.getStatus()).thenReturn("READY");
        expectReadiness(true, "PROFILE");
    }

    @Test void synchronousReadyProfileWithLatestSubmissionNeedsNoJobRow() {
        assertThat(service.requireCurrent(member)).isSameAs(profile);
        verify(logs).findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member, List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"));
        // No session-end event is required: submitted plays are analyzed before leaving the market.
        verify(logs, never()).findLatestCompletedSessionIds(any(), any());
    }

    @Test void oldReadyProfileCannotHideUnrequestedLatestSubmission() {
        when(profile.sourceSessionId()).thenReturn(UUID.randomUUID());
        expectReadiness(true, "NOT_REQUESTED");
    }

    @Test void submittedPlayWithoutAnyProfileIsPendingRatherThanAnOldOrStaticQuest() {
        when(profiles.current(member)).thenReturn(Optional.empty());
        expectReadiness(true, "NOT_REQUESTED");
    }

    @Test void sameSessionProfileWithEarlierSnapshotCannotHideNewSubmission() {
        snapshotWithSubmission(UUID.randomUUID());
        expectReadiness(true, "NOT_REQUESTED");
    }

    private UUID useLatestTimeout(UUID timeoutSession) {
        UUID timeoutId = UUID.randomUUID();
        var timeout = mock(BehaviorLog.class);
        when(timeout.getId()).thenReturn(timeoutId);
        when(timeout.getSessionId()).thenReturn(timeoutSession);
        when(timeout.getEventCode()).thenReturn("SHOP.TIME_LIMIT_EXPIRED");
        when(logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member,
                List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"))).thenReturn(Optional.of(timeout));
        return timeoutId;
    }

    @Test void newerTimeoutCannotReuseAnOldReadySubmittedSessionProfile() {
        UUID timeoutSession = UUID.randomUUID();
        useLatestTimeout(timeoutSession);
        expectReadiness(true, "NOT_REQUESTED");
        verify(jobs).latestForSession(member, timeoutSession);
    }

    @Test void timeoutInSameSessionRequiresItsExactSnapshotEventRatherThanEarlierSubmission() {
        UUID timeoutId = useLatestTimeout(session);
        // The ready snapshot still contains the earlier submission from setup.
        expectReadiness(true, "NOT_REQUESTED");
        snapshotWithSubmission(timeoutId);
        assertThat(service.requireCurrent(member)).isSameAs(profile);
    }

    @Test void linkedMarketAncestorMustAlsoIncludeTheLatestTimeoutSnapshot() {
        UUID timeoutId = useLatestTimeout(session);
        marketAncestor(Instant.EPOCH);
        expectReadiness(true, "NOT_REQUESTED");
        snapshotWithSubmission(timeoutId);
        assertThat(service.requireCurrent(member)).isSameAs(profile);
    }

    @Test void runningTimeoutAnalysisBlocksOlderReadyProfile() {
        useLatestTimeout(session);
        when(jobs.latestForSession(member, session)).thenReturn(job("RUNNING", "OBSERVATION", dataset, analysisId));
        expectReadiness(true, "OBSERVATION");
        verifyNoInteractions(analyses);
    }

    @Test void activeReanalysisBlocksEvenAnExistingReadyProfileForSameSession() {
        when(jobs.latestForSession(member, session)).thenReturn(job("RUNNING", "PROFILE", UUID.randomUUID(), null));
        expectReadiness(true, "PROFILE");
        verifyNoInteractions(analyses);
    }

    @Test void failedReanalysisDoesNotFallBackToPreviousReadyProfile() {
        when(jobs.latestForSession(member, session)).thenReturn(job("FAILED", "FAILED", dataset, analysisId));
        expectReadiness(false, "FAILED");
    }

    @Test void failedSynchronousProfileUpdateDoesNotFallBackToPreviousReadyProfile() {
        var failed = mock(AiUserProfile.class);
        when(failed.getStatus()).thenReturn("FAILED");
        when(profileRepository.findFirstByMemberIdAndSourceSessionIdOrderByCreatedAtDesc(member, session)).thenReturn(Optional.of(failed));
        expectReadiness(false, "PROFILE");
    }

    @Test void readyJobMustMatchBothAnalysisAndDatasetInCurrentProfile() {
        when(jobs.latestForSession(member, session)).thenReturn(job("READY", "READY", dataset, UUID.randomUUID()));
        expectReadiness(true, "PROFILE");
    }

    @Test void readyJobAndProfileWithExactSourceLinksPass() {
        when(jobs.latestForSession(member, session)).thenReturn(job("READY", "READY", dataset, analysisId));
        assertThat(service.requireCurrent(member)).isSameAs(profile);
    }

    @Test void profileCannotPointAtDifferentAnalysisDataset() {
        var analysis = mock(AiBehaviorAnalysisRun.class);
        when(analysis.getStatus()).thenReturn("READY");
        when(analysis.getDatasetId()).thenReturn(UUID.randomUUID());
        when(analyses.findByIdAndMemberId(analysisId, member)).thenReturn(Optional.of(analysis));
        expectReadiness(false, "PROFILE_LINK");
    }

    @Test void newerSynchronousRecoverySupersedesAnEarlierFailedJob() {
        var failedJob = job("FAILED", "FAILED", UUID.randomUUID(), UUID.randomUUID());
        when(jobs.latestForSession(member, session)).thenReturn(failedJob);
        when(profile.createdAt()).thenReturn(failedJob.updatedAt().plusSeconds(1));
        assertThat(service.requireCurrent(member)).isSameAs(profile);
    }

    @Test void newerProfileStillMustIncludeLatestSubmissionAfterFailedJob() {
        var failedJob = job("FAILED", "FAILED", dataset, analysisId);
        when(jobs.latestForSession(member, session)).thenReturn(failedJob);
        when(profile.createdAt()).thenReturn(failedJob.updatedAt().plusSeconds(1));
        snapshotWithSubmission(UUID.randomUUID());
        expectReadiness(false, "FAILED");
    }

    @Test void previousProfilePromptRequiresExplicitNewAnalysisEvenWhenSourceLinksMatch() {
        when(profile.promptVersion()).thenReturn("previous-profile-prompt");
        when(jobs.latestForSession(member, session)).thenReturn(job("READY", "READY", dataset, analysisId));
        expectReadiness(true, "NOT_REQUESTED");
    }

    private AiUserProfile marketAncestor(Instant createdAt) {
        UUID ancestorId = UUID.randomUUID();
        var ancestor = mock(AiUserProfile.class);
        when(ancestor.getId()).thenReturn(ancestorId);
        when(ancestor.getSourceSessionId()).thenReturn(session);
        when(ancestor.getSourceDatasetId()).thenReturn(dataset);
        when(ancestor.getSourceAnalysisId()).thenReturn(analysisId);
        when(ancestor.getCreatedAt()).thenReturn(createdAt);
        when(profile.sourceSessionId()).thenReturn(UUID.randomUUID());
        when(profile.previousProfileId()).thenReturn(ancestorId);
        when(profile.createdAt()).thenReturn(Instant.now());
        when(profileRepository.findByIdAndMemberIdAndStatus(ancestorId, member, "READY")).thenReturn(Optional.of(ancestor));
        return ancestor;
    }

    @Test void newerTransportProfileMayUseItsLinkedMarketAncestor() {
        marketAncestor(Instant.EPOCH);
        when(jobs.latestForSession(member, session)).thenReturn(job("READY", "READY", dataset, analysisId));
        assertThat(service.requireCurrent(member)).isSameAs(profile);
    }

    @Test void newerTransportProfileDoesNotRepairFailedMarketReanalysis() {
        marketAncestor(Instant.EPOCH);
        when(jobs.latestForSession(member, session)).thenReturn(job("FAILED", "FAILED", dataset, analysisId));
        when(profile.createdAt()).thenReturn(Instant.now().plusSeconds(60));
        expectReadiness(false, "FAILED");
    }

    @Test void missingOrForeignMarketAncestorCannotBeUsed() {
        UUID foreign = UUID.randomUUID();
        when(profile.sourceSessionId()).thenReturn(UUID.randomUUID());
        when(profile.previousProfileId()).thenReturn(foreign);
        when(profileRepository.findByIdAndMemberIdAndStatus(foreign, member, "READY")).thenReturn(Optional.empty());
        expectReadiness(true, "NOT_REQUESTED");
        verify(profileRepository).findByIdAndMemberIdAndStatus(foreign, member, "READY");
    }

    @Test void cyclicProfileChainFailsWithoutInfiniteTraversal() {
        UUID currentId = profile.profileId();
        when(profile.sourceSessionId()).thenReturn(UUID.randomUUID());
        when(profile.previousProfileId()).thenReturn(currentId);
        var cycle = mock(AiUserProfile.class);
        when(cycle.getId()).thenReturn(currentId);
        when(profileRepository.findByIdAndMemberIdAndStatus(currentId, member, "READY")).thenReturn(Optional.of(cycle));
        expectReadiness(false, "PROFILE_LINK");
        verify(profileRepository, times(1)).findByIdAndMemberIdAndStatus(currentId, member, "READY");
    }

    @Test void profileTraversalIsBoundedToOneHundredLookups() {
        when(profile.sourceSessionId()).thenReturn(UUID.randomUUID());
        when(profile.previousProfileId()).thenReturn(UUID.randomUUID());
        when(profileRepository.findByIdAndMemberIdAndStatus(any(), eq(member), eq("READY"))).thenAnswer(invocation -> {
            var next = mock(AiUserProfile.class);
            when(next.getId()).thenReturn(invocation.getArgument(0));
            when(next.getSourceSessionId()).thenReturn(UUID.randomUUID());
            when(next.getPreviousProfileId()).thenReturn(UUID.randomUUID());
            return Optional.of(next);
        });
        expectReadiness(true, "NOT_REQUESTED");
        verify(profileRepository, times(100)).findByIdAndMemberIdAndStatus(any(), eq(member), eq("READY"));
    }

    @Test void pendingAndFailureHaveDifferentMachineReadableHttpResponses() {
        var handler = new MarketProfileReadinessExceptionHandler();
        var pending = handler.handle(new MarketProfileReadinessException(true, "PROFILE", "분석 중"));
        var failed = handler.handle(new MarketProfileReadinessException(false, "PROFILE", "다시 분석"));
        assertThat(pending.getStatusCode().value()).isEqualTo(409);
        assertThat(pending.getBody().code()).isEqualTo("LATEST_PLAY_PROFILE_PENDING");
        assertThat(failed.getStatusCode().value()).isEqualTo(503);
        assertThat(failed.getBody().code()).isEqualTo("LATEST_PLAY_PROFILE_FAILED");
    }
}
