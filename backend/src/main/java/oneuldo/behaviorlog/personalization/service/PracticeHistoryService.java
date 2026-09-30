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
    private final AiUserProfileRepository profiles;
    private final BehaviorAnalysisInputSnapshotRepository snapshots;
    private final ObjectMapper mapper;

    @Transactional(readOnly = true)
    public ArrayNode forUpdate(UUID member, AiUserProfile previous, AiBehaviorAnalysisResponse current) {
        var entries = new ArrayList<ObjectNode>();
        var seen = new HashSet<UUID>();
        for (var assessment : current.analysis().sessionAssessments()) {
            if (entries.size() == 3) break;
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
        for (int depth = 0; profile != null && entries.size() < 3 && depth < 20; depth++) {
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
        for (var assessment : analysis.sessionAssessments()) if (session.equals(assessment.sessionId())) {
            row.put("priorAiJudgment", assessment.judgment());
            // Do not feed a possibly wrong explanation back as the recorded purchase.
        }
        var snapshot = snapshots.findByIdAndMemberId(dataset, member);
        row.put("sourceAvailable", snapshot.isPresent());
        if (snapshot.isPresent()) row.set("recordedPractice", project(mapper, BehaviorAnalysisInputResponse.from(snapshot.get()), session));
        return row;
    }

    /** Raw task, instructions, SKU descriptions and submitted cart. IDs here are context, not new citation grants. */
    public static ObjectNode project(ObjectMapper mapper, BehaviorAnalysisInputResponse input, UUID session) {
        var result = mapper.createObjectNode();
        var tasks = result.putArray("tasks");
        for (var task : new AiBehaviorAnalysisPromptFactory(mapper).tasks(input))
            if (session.toString().equals(task.path("sessionId").asString())) tasks.add(task.deepCopy());
        var events = result.putArray("purchaseEvents");
        for (var event : SourceEventDetails.build(mapper, input))
            if (session.toString().equals(event.path("sessionId").asString())
                    && (event.has("selectedProduct") || "SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString())))
                events.add(event.deepCopy());
        // Remove only citation anchors, not product or mission identifiers.
        tasks.forEach(t -> ((ObjectNode)t).remove("sourceEventId"));
        events.forEach(e -> ((ObjectNode)e).remove("id"));
        return result;
    }

    private ArrayNode chronological(List<ObjectNode> entries, Set<UUID> currentSessions) {
        var result = mapper.createArrayNode();
        for (int i = entries.size() - 1; i >= 0; i--) {
            var row = entries.get(i);
            row.put("playOrder", result.size() + 1);
            row.put("currentSession", currentSessions.contains(UUID.fromString(row.path("sessionId").asString())));
            result.add(row);
        }
        return result;
    }
}
