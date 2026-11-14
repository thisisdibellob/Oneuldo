package oneuldo.behaviorlog.analysis.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class AnalysisJobProfileVersionTest {
    @Test void readyJobWithOldProfilePromptCreatesANewJobWithoutCallingTheModel() {
        enqueueCachedReady("previous-profile-prompt", false);
    }

    @Test void readyJobWithCurrentLinkedProfileIsReused() {
        enqueueCachedReady(AiUserProfilePromptFactory.VERSION, true);
    }

    @SuppressWarnings("unchecked")
    private void enqueueCachedReady(String version, boolean reusable) {
        UUID member = UUID.randomUUID(), session = UUID.randomUUID(), dataset = UUID.randomUUID(), analysis = UUID.randomUUID();
        var ready = new AnalysisJobService.Job(UUID.randomUUID(), session, dataset, "READY", "READY", 0, 0, null, analysis, null, Instant.now(), Instant.now());
        var queued = new AnalysisJobService.Job(UUID.randomUUID(), session, dataset, "QUEUED", "QUEUED", 0, 0, null, null, null, Instant.now(), Instant.now());
        var db = mock(JdbcTemplate.class);
        when(db.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of(ready), List.of(queued));
        var inputs = mock(BehaviorAnalysisInputService.class);
        var snapshot = mock(BehaviorAnalysisInputResponse.class);
        when(snapshot.id()).thenReturn(dataset);
        when(inputs.createForSession(member, null, session)).thenReturn(snapshot);
        var profiles = mock(AiUserProfileService.class);
        var profile = mock(AiUserProfileResponse.class);
        when(profile.status()).thenReturn("READY");
        when(profile.promptVersion()).thenReturn(version);
        when(profile.sourceSessionId()).thenReturn(session);
        when(profile.sourceDatasetId()).thenReturn(dataset);
        when(profile.sourceAnalysisId()).thenReturn(analysis);
        when(profiles.current(member)).thenReturn(Optional.of(profile));
        var analyses = mock(AiBehaviorAnalysisService.class);
        var jobs = new AnalysisJobService(db, inputs, analyses, profiles, mock(BehaviorLogRepository.class));
        try {
            assertThat(jobs.enqueue(member, session).id()).isEqualTo(reusable ? ready.id() : queued.id());
            if (reusable) verify(db, never()).update(anyString(), any(Object[].class));
            else verify(db).update(startsWith("INSERT INTO ai_analysis_jobs"), any(Object[].class));
            verifyNoInteractions(analyses);
        } finally { jobs.close(); }
    }

    @Test void currentVersionAloneCannotReuseAReadyJobWhoseAnalysisLinkIsDifferent() {
        UUID session = UUID.randomUUID(), dataset = UUID.randomUUID(), analysis = UUID.randomUUID();
        var ready = new AnalysisJobService.Job(UUID.randomUUID(), session, dataset, "READY", "READY", 0, 0, null, analysis, null, Instant.now(), Instant.now());
        var profile = mock(AiUserProfileResponse.class);
        when(profile.status()).thenReturn("READY");
        when(profile.promptVersion()).thenReturn(AiUserProfilePromptFactory.VERSION);
        when(profile.sourceSessionId()).thenReturn(session);
        when(profile.sourceDatasetId()).thenReturn(dataset);
        when(profile.sourceAnalysisId()).thenReturn(UUID.randomUUID());
        assertThat(AnalysisJobService.reflectsCurrentProfile(ready, profile)).isFalse();
    }
}
