package oneuldo.behaviorlog.analysis.domain;
import java.util.List;
import java.util.UUID;
/** AI-authored intermediate interpretation, never a lossless replacement for raw observations. */
public record AiObservationDigest(String summary, List<Observation> observations, List<String> uncertainties, List<UUID> requestedSegmentIds) {
    public AiObservationDigest(String summary,List<Observation> observations,List<String> uncertainties) {
        this(summary,observations,uncertainties,List.of());
    }
    public AiObservationDigest {
        requestedSegmentIds=requestedSegmentIds==null?List.of():List.copyOf(requestedSegmentIds);
    }
    public record Observation(String observation, String interpretation, List<String> alternativeExplanations, List<UUID> evidenceEventIds) {}
}
