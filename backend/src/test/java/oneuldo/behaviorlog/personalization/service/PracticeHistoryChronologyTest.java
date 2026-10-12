package oneuldo.behaviorlog.personalization.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory;
import oneuldo.member.domain.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** Real history service with synthetic immutable snapshots; no model, database or gameplay. */
class PracticeHistoryChronologyTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final AiUserProfileRepository profiles = mock(AiUserProfileRepository.class);
    private final BehaviorAnalysisInputSnapshotRepository snapshots = mock(BehaviorAnalysisInputSnapshotRepository.class);
    private final PracticeHistoryService service = new PracticeHistoryService(profiles, snapshots, mapper);
    private final UUID member = UUID.randomUUID(), sessionA = UUID.randomUUID(), sessionB = UUID.randomUUID();
    private final UUID originalDatasetA = UUID.randomUUID(), profileDatasetA = UUID.randomUUID();
    private final UUID currentDatasetA = UUID.randomUUID(), datasetB = UUID.randomUUID();
    private final Instant startedA = Instant.parse("2026-10-01T10:00:00Z");
    private final Instant startedB = Instant.parse("2026-10-02T10:00:00Z");
    private final Map<UUID, BehaviorAnalysisInput> fixtureInputs = new LinkedHashMap<>();
    private String testCase;

    @BeforeEach void recordCaseName(TestInfo info) {
        testCase = info.getTestMethod().orElseThrow().getName();
    }

    @Test void ancestor_reanalysis_keeps_actual_A_then_B_chronology_in_both_history_apis() {
        var fixture = fixture(startedA, startedA.plusSeconds(600), startedB, startedB.plusSeconds(600), true);
        var update = service.forUpdate(member, fixture.latestA(), fixture.current());
        var profile = service.forProfile(member, AiUserProfileResponse.from(fixture.latestA()));

        assertChronology(update, sessionA, sessionB, "RECORDED_SESSION_START_WITH_PROFILE_LINK_TIEBREAK");
        assertChronology(profile, sessionA, sessionB, "RECORDED_SESSION_START_WITH_PROFILE_LINK_TIEBREAK");
        for (var history : List.of(update, profile)) {
            assertThat(history.get(0).path("recordedSessionStartedAt").asString()).isEqualTo(startedA.toString());
            assertThat(history.get(0).path("recordedSessionEndedAt").asString()).isEqualTo(startedA.plusSeconds(600).toString());
            assertThat(history.get(1).path("recordedSessionStartedAt").asString()).isEqualTo(startedB.toString());
            assertThat(history.get(1).path("recordedSessionEndedAt").asString()).isEqualTo(startedB.plusSeconds(600).toString());
            assertThat(history.get(0).path("currentSession").asBoolean()).isTrue();
            assertThat(history.get(1).path("currentSession").asBoolean()).isFalse();
        }
        assertThat(update.get(0).path("sourceDatasetId").asString()).isEqualTo(currentDatasetA.toString());
        assertThat(profile.get(0).path("sourceDatasetId").asString()).isEqualTo(profileDatasetA.toString());
        assertThat(update.get(1).path("sourceDatasetId").asString()).isEqualTo(datasetB.toString());
        assertThat(profile.get(1).path("sourceDatasetId").asString()).isEqualTo(datasetB.toString());
        // Snapshot generation happened later; its revision is not a new session occurrence.
        assertThat(fixtureInputs.get(currentDatasetA).generatedAt()).isAfter(startedB);
        verify(snapshots, never()).findByIdAndMemberId(originalDatasetA, member);
        verify(snapshots).findByIdAndMemberId(currentDatasetA, member);
        verify(snapshots).findByIdAndMemberId(profileDatasetA, member);
        verify(snapshots, times(2)).findByIdAndMemberId(datasetB, member);
        recordEvidence(fixture, update, profile);
    }

    @Test void another_snapshot_revision_of_A_preserves_two_distinct_sessions_and_the_source_selected_by_each_api() {
        var fixture = fixture(startedA, startedA.plusSeconds(600), startedB, startedB.plusSeconds(600), true);
        var update = service.forUpdate(member, fixture.latestA(), fixture.current());
        var profile = service.forProfile(member, AiUserProfileResponse.from(fixture.latestA()));

        assertThat(currentDatasetA).isNotEqualTo(profileDatasetA).isNotEqualTo(originalDatasetA);
        assertThat(update).hasSize(2);
        assertThat(profile).hasSize(2);
        assertThat(sessionIds(update)).containsExactly(sessionA.toString(), sessionB.toString());
        assertThat(sessionIds(profile)).containsExactlyElementsOf(sessionIds(update));
        assertThat(update.get(0).path("recordedPractice")).isEqualTo(profile.get(0).path("recordedPractice"));
        assertThat(update.get(0).path("sourceDatasetId").asString()).isEqualTo(currentDatasetA.toString());
        assertThat(profile.get(0).path("sourceDatasetId").asString()).isEqualTo(profileDatasetA.toString());
        assertThat(update.toString()).doesNotContain(originalDatasetA.toString());
        assertThat(profile.toString()).doesNotContain(originalDatasetA.toString());
        recordEvidence(fixture, update, profile);
    }

    @Test void missing_source_timestamps_keep_profile_link_order_and_the_unknown_scope_without_invented_dates() {
        var fixture = fixture(null, null, startedB, startedB.plusSeconds(600), true);
        var update = service.forUpdate(member, fixture.latestA(), fixture.current());
        var profile = service.forProfile(member, AiUserProfileResponse.from(fixture.latestA()));

        for (var history : List.of(update, profile)) {
            assertChronology(history, sessionB, sessionA, "PROFILE_LINK_ORDER_SOURCE_TIME_MISSING");
            var target = history.get(1);
            assertThat(target.path("currentSession").asBoolean()).isTrue();
            assertThat(target.has("recordedSessionStartedAt")).isFalse();
            assertThat(target.has("recordedSessionEndedAt")).isFalse();
            assertThat(target.path("sourceAvailable").asBoolean()).isTrue();
            assertThat(history.get(0).path("recordedSessionStartedAt").asString()).isEqualTo(startedB.toString());
            assertUnknownScopeSurvivesProfileEncoding(fixture, history, sessionA);
        }
        recordEvidence(fixture, update, profile);
    }

    @Test void a_missing_snapshot_keeps_its_distinct_source_identity_but_does_not_fill_source_time_or_practice() {
        var fixture = fixture(startedA, startedA.plusSeconds(600), startedB, startedB.plusSeconds(600), false);
        var update = service.forUpdate(member, fixture.latestA(), fixture.current());
        var profile = service.forProfile(member, AiUserProfileResponse.from(fixture.latestA()));

        for (var history : List.of(update, profile)) {
            assertChronology(history, sessionB, sessionA, "PROFILE_LINK_ORDER_SOURCE_TIME_MISSING");
            var missing = history.get(0);
            assertThat(missing.path("sourceDatasetId").asString()).isEqualTo(datasetB.toString());
            assertThat(missing.path("sourceAvailable").asBoolean()).isFalse();
            assertThat(missing.has("recordedSessionStartedAt")).isFalse();
            assertThat(missing.has("recordedSessionEndedAt")).isFalse();
            assertThat(missing.has("recordedPractice")).isFalse();
            assertThat(missing.path("currentSession").asBoolean()).isFalse();
            assertThat(history.get(1).path("currentSession").asBoolean()).isTrue();
            assertUnknownScopeSurvivesProfileEncoding(fixture, history, sessionB);
        }
        recordEvidence(fixture, update, profile);
    }

    private void assertChronology(ArrayNode history, UUID first, UUID second, String orderingScope) {
        assertThat(history).hasSize(2);
        assertThat(sessionIds(history)).containsExactly(first.toString(), second.toString());
        for (int i = 0; i < history.size(); i++) {
            assertThat(history.get(i).path("playOrder").asInt()).isEqualTo(i + 1);
            assertThat(history.get(i).path("orderingScope").asString()).isEqualTo(orderingScope);
            assertThat(history.get(i).path("currentSessionMeaning").asString())
                    .isEqualTo("CURRENT_ANALYSIS_TARGET_NOT_LATEST_PLAY");
        }
    }

    private List<String> sessionIds(ArrayNode history) {
        return java.util.stream.StreamSupport.stream(history.spliterator(), false)
                .map(row -> row.path("sessionId").asString()).toList();
    }

    private void assertUnknownScopeSurvivesProfileEncoding(Fixture fixture, ArrayNode history, UUID noTimeSession) {
        var prompts = new AiUserProfilePromptFactory(mapper);
        var wire = mapper.readTree(prompts.withPracticeHistory(prompts.userPrompt(fixture.latestA(), fixture.current()), history));
        var decoded = LosslessHistoryEncoding.decodeHistory(mapper, wire);
        var missing = java.util.stream.StreamSupport.stream(decoded.spliterator(), false)
                .filter(row -> row.path("sessionId").asString().equals(noTimeSession.toString())).findFirst().orElseThrow();
        assertThat(missing.path("orderingScope").asString()).isEqualTo("PROFILE_LINK_ORDER_SOURCE_TIME_MISSING");
        assertThat(missing.has("recordedSessionStartedAt")).isFalse();
        assertThat(missing.has("recordedSessionEndedAt")).isFalse();
        assertThat(wire.path("practiceHistoryScope").asString()).contains("원본 시작 시각 일부가 없어",
                "실제 플레이 발생 순서나 전후 학습 변화로 단정하지 않는다", "추가 성공·숙달 횟수가 아니다");
        assertThat(decoded.toString()).doesNotContain("\"recordedSessionStartedAt\":0", "\"recordedSessionEndedAt\":0", "1970-01-01");
    }

    private Fixture fixture(Instant startA, Instant endA, Instant startB, Instant endB, boolean snapshotBAvailable) {
        var oldA = profile(1, null, originalDatasetA, sessionA);
        var b = profile(2, oldA.getId(), datasetB, sessionB);
        var latestA = profile(3, b.getId(), profileDatasetA, sessionA);
        when(profiles.findByIdAndMemberIdAndStatus(oldA.getId(), member, "READY")).thenReturn(Optional.of(oldA));
        when(profiles.findByIdAndMemberIdAndStatus(b.getId(), member, "READY")).thenReturn(Optional.of(b));
        when(profiles.findByIdAndMemberIdAndStatus(latestA.getId(), member, "READY")).thenReturn(Optional.of(latestA));
        snapshot(originalDatasetA, sessionA, startA, endA, Instant.parse("2026-10-01T12:00:00Z"));
        snapshot(profileDatasetA, sessionA, startA, endA, Instant.parse("2026-10-03T12:00:00Z"));
        snapshot(currentDatasetA, sessionA, startA, endA, Instant.parse("2026-10-04T12:00:00Z"));
        if (snapshotBAvailable) snapshot(datasetB, sessionB, startB, endB, Instant.parse("2026-10-02T12:00:00Z"));
        else when(snapshots.findByIdAndMemberId(datasetB, member)).thenReturn(Optional.empty());
        var current = new AiBehaviorAnalysisResponse(UUID.randomUUID(), currentDatasetA, "READY", "synthetic-no-provider",
                "test", "test", 0, 0, Instant.parse("2026-10-04T12:00:00Z"), null, analysis(sessionA));
        return new Fixture(oldA, b, latestA, current);
    }

    private void snapshot(UUID dataset, UUID session, Instant startedAt, Instant endedAt, Instant generatedAt) {
        var input = new BehaviorAnalysisInput("chronology-test", dataset, generatedAt,
                new BehaviorAnalysisInput.AnalysisWindow(Instant.parse("2026-10-01T00:00:00Z"), generatedAt),
                "synthetic-subject", 1, 0,
                List.of(new BehaviorAnalysisInput.SessionTimeline(session, startedAt, endedAt, null, List.of())));
        fixtureInputs.put(dataset, input);
        var snapshot = new BehaviorAnalysisInputSnapshot(mock(Member.class), input);
        when(snapshots.findByIdAndMemberId(dataset, member)).thenReturn(Optional.of(snapshot));
    }

    private AiUserProfile profile(long version, UUID previous, UUID dataset, UUID session) {
        return new AiUserProfile(member, version, previous, UUID.randomUUID(), dataset, session,
                "READY", "chronology-test", "synthetic-no-provider", "", "", List.of(), analysis(session), null, 0);
    }

    private AiBehaviorAnalysis analysis(UUID session) {
        return new AiBehaviorAnalysis("출처 순서 테스트", List.of(),
                List.of(new AiBehaviorAnalysis.SessionAssessment(session, "UNDETERMINED", "성패 미검사", List.of())),
                List.of(), null);
    }

    private void recordEvidence(Fixture fixture, ArrayNode update, ArrayNode profile) {
        String directory = System.getProperty("oneuldo.test.history-evidence-dir");
        if (directory == null) return;
        var record = mapper.createObjectNode().put("testCase", testCase).put("executionKind", "REAL_HISTORY_SERVICE_SYNTHETIC_SNAPSHOT_TEST")
                .put("newActualPlay", false).put("actualModelCalls", 0);
        record.set("syntheticSnapshotInputs", mapper.valueToTree(fixtureInputs.values()));
        record.set("profileChain", mapper.valueToTree(List.of(AiUserProfileResponse.from(fixture.oldA()),
                AiUserProfileResponse.from(fixture.b()), AiUserProfileResponse.from(fixture.latestA()))));
        record.set("forUpdate", update);
        record.set("forProfile", profile);
        try {
            var output = Path.of(directory);
            Files.createDirectories(output);
            Files.writeString(output.resolve(testCase + "-" + UUID.randomUUID() + ".json"),
                    mapper.writeValueAsString(record), StandardOpenOption.CREATE_NEW);
        } catch (java.io.IOException failure) {
            throw new java.io.UncheckedIOException(failure);
        }
    }

    private record Fixture(AiUserProfile oldA, AiUserProfile b, AiUserProfile latestA, AiBehaviorAnalysisResponse current) {}
}
