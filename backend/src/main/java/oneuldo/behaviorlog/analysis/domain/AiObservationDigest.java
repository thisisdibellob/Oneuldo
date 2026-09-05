package oneuldo.behaviorlog.analysis.domain;
import java.util.List;
import java.util.UUID;
/** AI-authored intermediate interpretation, never a lossless replacement for raw observations. */
public record AiObservationDigest(String summary, List<Observation> observations, List<String> uncertainties) {
    public record Observation(String observation, String interpretation, List<String> alternativeExplanations, List<UUID> evidenceEventIds) {}
}
