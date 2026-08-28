package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

public record CookingBehaviorPayload(
        String ingredientId,
        String toolId,
        String recipeStepId,
        @PositiveOrZero Double quantity,
        @PositiveOrZero Double targetQuantity,
        @PositiveOrZero Long timerTargetMs,
        Long timerErrorMs,
        Boolean heatLeftOn,
        Boolean problemDetected,
        Boolean problemResolved
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.COOKING;
    }
}
