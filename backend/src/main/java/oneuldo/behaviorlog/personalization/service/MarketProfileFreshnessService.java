package oneuldo.behaviorlog.personalization.service;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.repository.AiBehaviorAnalysisRepository;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.AnalysisJobService;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Refuse an old plan while the most recent submitted or expired market play is not reflected. */
@Service
@RequiredArgsConstructor
public class MarketProfileFreshnessService {
    private final BehaviorLogRepository logs;
    private final AiUserProfileService profiles;
    private final AiUserProfileRepository profileRepository;
    private final AnalysisJobService jobs;
    private final AiBehaviorAnalysisRepository analyses;
    private final BehaviorAnalysisInputSnapshotRepository snapshots;

    @Transactional(readOnly = true)
    public AiUserProfileResponse requireCurrent(UUID member) {
        var terminal = logs.findFirstByMemberIdAndEventCodeInOrderByReceivedAtDescEventSequenceDesc(member,
                List.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED"));
        if (terminal.isEmpty()) return profileBeforeFirstTerminal(member);

        var latest = terminal.get();
        var job = jobs.latestForSession(member, latest.getSessionId());
        if (job != null && ("QUEUED".equals(job.status()) || "RUNNING".equals(job.status())))
            throw pending(job.stage());

        var attempt = profileRepository.findFirstByMemberIdAndSourceSessionIdOrderByCreatedAtDesc(member, latest.getSessionId());
        var current = profiles.current(member);
        if (current.isEmpty() && ((job != null && "FAILED".equals(job.status()))
                || (attempt.isPresent() && "FAILED".equals(attempt.get().getStatus())))) throw failed("PROFILE");
        var profile = current.orElseThrow(() -> pending("NOT_REQUESTED"));
        if (!oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory.VERSION.equals(profile.promptVersion()))
            throw pending("NOT_REQUESTED");
        // A transport/other quest can be newer than the market play. Find its incorporated market ancestor.
        var represented = representedMarketSource(member, Source.from(profile), latest.getSessionId(), latest.getId());
        if (represented == null) {
            if (job != null && "FAILED".equals(job.status())) throw failed("FAILED");
            if (attempt.isPresent() && "FAILED".equals(attempt.get().getStatus())) throw failed("PROFILE");
            throw pending("NOT_REQUESTED");
        }
        if (attempt.isPresent() && "FAILED".equals(attempt.get().getStatus())
                && !after(represented.createdAt(), attempt.get().getCreatedAt())) throw failed("PROFILE");

        // A later non-market profile is not proof that a failed market reanalysis was repaired.
        boolean jobSuperseded = job != null && after(represented.createdAt(), job.updatedAt());
        if (job != null && "FAILED".equals(job.status()) && !jobSuperseded) throw failed("FAILED");

        // Also support synchronous analyses, which have no analysis-job row.
        if (job != null && !jobSuperseded && (!represented.datasetId().equals(job.datasetId())
                || !represented.analysisId().equals(job.analysisId()))) throw pending("PROFILE");
        return profile;
    }

    private AiUserProfileResponse profileBeforeFirstTerminal(UUID member) {
        var current = profiles.current(member);
        if (current.isPresent()) return current.get();
        // Do not turn a running/failed analysis or profile update into a first-play signal.
        var job = jobs.current(member);
        if (job != null) {
            if ("QUEUED".equals(job.status()) || "RUNNING".equals(job.status())) throw pending(job.stage());
            if ("FAILED".equals(job.status())) throw failed(job.stage());
            throw pending("PROFILE");
        }
        var attempt = profileRepository.findFirstByMemberIdOrderByCreatedAtDesc(member);
        if (attempt.isPresent()) {
            if ("FAILED".equals(attempt.get().getStatus())) throw failed("PROFILE");
            throw pending("PROFILE");
        }
        // An empty-input audit is not a failure or active analysis, and must not hide earlier actual runs.
        var analysis = analyses.findFirstByMemberIdAndStatusNotOrderByCreatedAtDesc(member, "NO_HISTORY");
        if (analysis.isPresent()) {
            if ("FAILED".equals(analysis.get().getStatus())) throw failed("ANALYSIS");
            throw pending("READY".equals(analysis.get().getStatus()) ? "PROFILE" : "ANALYSIS");
        }
        throw new MarketBaselineRequiredException();
    }

    private Source representedMarketSource(UUID member, Source source, UUID sessionId, UUID terminalId) {
        var visited = new HashSet<UUID>();
        for (int depth = 0; source != null && depth < 100; depth++) {
            if (!visited.add(source.profileId())) throw failed("PROFILE_LINK");
            if (sessionId.equals(source.sessionId())) {
                var analysis = analyses.findByIdAndMemberId(source.analysisId(), member).orElseThrow(() -> failed("PROFILE_LINK"));
                if (!"READY".equals(analysis.getStatus()) || !source.datasetId().equals(analysis.getDatasetId()))
                    throw failed("PROFILE_LINK");
                var snapshot = snapshots.findByIdAndMemberId(source.datasetId(), member).orElseThrow(() -> failed("PROFILE_LINK"));
                boolean containsTerminal = snapshot.getInputData().sessions().stream()
                        .filter(session -> sessionId.equals(session.sessionId()))
                        .flatMap(session -> session.events().stream())
                        .anyMatch(event -> terminalId.equals(event.behaviorLogId()));
                if (containsTerminal) return source;
            }
            if (source.previousProfileId() == null) return null;
            // The member-scoped lookup must not follow another member's profile IDs.
            source = profileRepository.findByIdAndMemberIdAndStatus(source.previousProfileId(), member, "READY")
                    .map(Source::from).orElse(null);
        }
        return null;
    }

    private static boolean after(Instant candidate, Instant earlier) {
        return candidate != null && earlier != null && candidate.isAfter(earlier);
    }

    private record Source(UUID profileId, UUID previousProfileId, UUID sessionId, UUID datasetId, UUID analysisId, Instant createdAt) {
        static Source from(AiUserProfileResponse profile) {
            return new Source(profile.profileId(), profile.previousProfileId(), profile.sourceSessionId(),
                    profile.sourceDatasetId(), profile.sourceAnalysisId(), profile.createdAt());
        }
        static Source from(AiUserProfile profile) {
            return new Source(profile.getId(), profile.getPreviousProfileId(), profile.getSourceSessionId(),
                    profile.getSourceDatasetId(), profile.getSourceAnalysisId(), profile.getCreatedAt());
        }
    }

    private static MarketProfileReadinessException pending(String stage) {
        return new MarketProfileReadinessException(true, stage,
                "최신 플레이 분석과 프로필 반영이 끝나야 다음 추천을 만들 수 있어요. 분석 탭에서 진행 상태를 확인해 주세요.");
    }
    private static MarketProfileReadinessException failed(String stage) {
        return new MarketProfileReadinessException(false, stage,
                "최신 플레이를 프로필에 반영하지 못했어요. 분석 탭에서 다시 요청해 주세요. 이전 결과로 추천을 만들지 않았어요.");
    }
}
