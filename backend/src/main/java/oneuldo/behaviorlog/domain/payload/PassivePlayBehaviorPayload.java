package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.domain.type.PostErrorAction;

public record PassivePlayBehaviorPayload(
        @PositiveOrZero Integer backtrackCount,
        @PositiveOrZero Double backtrackDistance,
        @PositiveOrZero Double travelDistance,
        @DecimalMin("0.0") @DecimalMax("1.0") Double routeEfficiency,
        Boolean landmarkPause,
        @PositiveOrZero Integer mapOpenCount,
        Boolean waypointUsed,
        @PositiveOrZero Integer newAreaEntryCount,
        @DecimalMin("0.0") @DecimalMax("1.0") Double explorationRatio,
        Boolean lostStateDetected,
        @PositiveOrZero Long helpRequestLatencyMs,
        @PositiveOrZero Integer contentReopenCount,
        @PositiveOrZero Integer dialogueRepeatCount,
        @PositiveOrZero Long postInteractionLatencyMs,
        Boolean questionSelected,
        Boolean clarificationRequested,
        @PositiveOrZero Long dialogueIdleMs,
        @PositiveOrZero Integer repeatChoiceCount,
        @PositiveOrZero Integer menuLoopCount,
        @PositiveOrZero Integer dragFailCount,
        @PositiveOrZero Double pointerDistance,
        @PositiveOrZero Long settingsFindTimeMs,
        Boolean helpMenuUsed,
        PostErrorAction postErrorAction
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.PASSIVE_PLAY;
    }
}
