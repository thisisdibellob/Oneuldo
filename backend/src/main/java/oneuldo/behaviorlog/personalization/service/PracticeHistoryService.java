package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.*;

/** Recent distinct played sessions, copied from immutable snapshots. No failure count, score or policy. */
@Service
@RequiredArgsConstructor
public class PracticeHistoryService {
    public static final int MAX_DISTINCT_SESSIONS = 12;
    private final AiUserProfileRepository profiles;
    private final BehaviorAnalysisInputSnapshotRepository snapshots;
    private final ObjectMapper mapper;

    @Transactional(readOnly = true)
    public ArrayNode forUpdate(UUID member, AiUserProfile previous, AiBehaviorAnalysisResponse current) {
        var entries = new ArrayList<ObjectNode>();
        var seen = new HashSet<UUID>();
        for (var assessment : current.analysis().sessionAssessments()) {
            if (entries.size() == MAX_DISTINCT_SESSIONS) break;
            if (seen.add(assessment.sessionId()))
                entries.add(entry(member, current.datasetId(), assessment.sessionId(), current.analysis()));
        }
        collect(member, previous, seen, entries);
        return chronological(entries, current.analysis().sessionAssessments().stream().map(a -> a.sessionId()).collect(java.util.stream.Collectors.toSet()));
    }

    @Transactional(readOnly = true)
    public ArrayNode forProfile(UUID member, AiUserProfileResponse current) {
        var entries = new ArrayList<ObjectNode>();
        var profile = profiles.findByIdAndMemberIdAndStatus(current.profileId(), member, "READY").orElse(null);
        collect(member, profile, new HashSet<>(), entries);
        return chronological(entries, Set.of(current.sourceSessionId()));
    }

    private void collect(UUID member, AiUserProfile profile, Set<UUID> seen, List<ObjectNode> entries) {
        var visited = new HashSet<UUID>();
        // Reanalysis versions of one session must not masquerade as repeated plays.
        for (int depth = 0; profile != null && entries.size() < MAX_DISTINCT_SESSIONS && depth < 100; depth++) {
            if (!member.equals(profile.getMemberId()) || !visited.add(profile.getId())) break;
            if (seen.add(profile.getSourceSessionId()))
                entries.add(entry(member, profile.getSourceDatasetId(), profile.getSourceSessionId(), profile.getProfile()));
            var previousId = profile.getPreviousProfileId();
            profile = previousId == null ? null : profiles.findByIdAndMemberIdAndStatus(previousId, member, "READY").orElse(null);
        }
    }

    private ObjectNode entry(UUID member, UUID dataset, UUID session, AiBehaviorAnalysis analysis) {
        var row = mapper.createObjectNode();
        row.put("sessionId", session.toString());
        row.put("sourceDatasetId", dataset.toString());
        for (var assessment : analysis.sessionAssessments()) if (session.equals(assessment.sessionId())) {
            row.put("priorAiJudgment", assessment.judgment());
            // Do not feed a possibly wrong explanation back as the recorded purchase.
        }
        var snapshot = snapshots.findByIdAndMemberId(dataset, member);
        row.put("sourceAvailable", snapshot.isPresent());
        if (snapshot.isPresent()) {
            var input = BehaviorAnalysisInputResponse.from(snapshot.get());
            row.set("recordedPractice", project(mapper, input, session));
            input.input().sessions().stream().filter(s -> session.equals(s.sessionId())).findFirst().ifPresent(s -> {
                if (s.startedAt() != null) row.put("recordedSessionStartedAt", s.startedAt().toString());
                if (s.endedAt() != null) row.put("recordedSessionEndedAt", s.endedAt().toString());
            });
        }
        return row;
    }

    /** Raw task, instructions, SKU descriptions and submitted cart. IDs here are context, not new citation grants. */
    public static ObjectNode project(ObjectMapper mapper, BehaviorAnalysisInputResponse input, UUID session) {
        var result = mapper.createObjectNode();
        var tasks = result.putArray("tasks");
        for (var task : new AiBehaviorAnalysisPromptFactory(mapper).tasks(input))
            if (session.toString().equals(task.path("sessionId").asString())) tasks.add(task.deepCopy());
        var events = result.putArray("purchaseEvents");
        var instructions = result.putArray("recordedInstructionEvents");
        var timing = result.putArray("timingEvents");
        for (var event : SourceEventDetails.build(mapper, input)) {
            if (!session.toString().equals(event.path("sessionId").asString())) continue;
            if (event.has("selectedProduct") || Set.of("SHOP.CHECKOUT_SUBMITTED", "SHOP.TIME_LIMIT_EXPIRED")
                    .contains(event.path("eventCode").asString()))
                events.add(event.deepCopy());
            if (Set.of("SHOP.TIME_LIMIT_STARTED", "SHOP.TIME_LIMIT_EXPIRED", "SHOP.CHECKOUT_SUBMITTED", "SHOP.SESSION_ENDED")
                    .contains(event.path("eventCode").asString()) && event.has("timing"))
                timing.add(event.deepCopy());
            // Collector events, not a judgment that the text was read, understood or needed.
            if (Set.of("SHOP.BRIEFING_ADVANCED", "SHOP.CHECKOUT_ENTERED", "SHOP.STAFF_HELP_REQUESTED", "SHOP.GENERAL_HELP_OPENED")
                    .contains(event.path("eventCode").asString()))
                instructions.add(event.deepCopy());
        }
        // Remove only citation anchors, not product or mission identifiers.
        tasks.forEach(t -> ((ObjectNode)t).remove("sourceEventId"));
        events.forEach(e -> ((ObjectNode)e).remove("id"));
        instructions.forEach(e -> ((ObjectNode)e).remove("id"));
        timing.forEach(e -> ((ObjectNode)e).remove("id"));
        result.set("sourceMovementContext", MovementSourceContext.forSession(mapper, input, session));
        return result;
    }

    private ArrayNode chronological(List<ObjectNode> entries, Set<UUID> currentSessions) {
        var result = mapper.createArrayNode();
        var ordered = new ArrayList<>(entries);
        Collections.reverse(ordered);
        boolean hasAllStarts = ordered.stream().allMatch(row -> row.hasNonNull("recordedSessionStartedAt"));
        if (hasAllStarts) ordered.sort(Comparator.comparing(row -> java.time.Instant.parse(row.path("recordedSessionStartedAt").asString())));
        for (var row : ordered) {
            row.put("playOrder", result.size() + 1);
            row.put("currentSession", currentSessions.contains(UUID.fromString(row.path("sessionId").asString())));
            row.put("currentSessionMeaning", "CURRENT_ANALYSIS_TARGET_NOT_LATEST_PLAY");
            row.put("orderingScope", hasAllStarts ? "RECORDED_SESSION_START_WITH_PROFILE_LINK_TIEBREAK" : "PROFILE_LINK_ORDER_SOURCE_TIME_MISSING");
            result.add(row);
        }
        return result;
    }
}
