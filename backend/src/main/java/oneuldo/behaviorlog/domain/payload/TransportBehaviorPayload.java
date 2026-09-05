package oneuldo.behaviorlog.domain.payload;
import java.util.Map;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
/** Client-reported displayed scene is observation data, not trusted instructions or a correct-answer label. */
public record TransportBehaviorPayload(Map<String, Object> presentedContent, String selectedChoiceId,
        int attemptNumber, boolean hintUsed, long responseTimeMs, String observationScope) implements BehaviorPayload {
    @Override public BehaviorPayloadType type() { return BehaviorPayloadType.TRANSPORT; }
}

