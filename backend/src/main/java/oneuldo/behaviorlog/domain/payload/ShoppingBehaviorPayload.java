package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

public record ShoppingBehaviorPayload(
        @PositiveOrZero Double pathDistance,
        @PositiveOrZero Double shortestPossibleDistance,
        @DecimalMin("0.0") @DecimalMax("1.0") Double pathEfficiency,
        @PositiveOrZero Integer listOpenCount,
        @PositiveOrZero Integer wrongAisleCount,
        @PositiveOrZero Integer backtrackingCount,
        @PositiveOrZero Integer repeatedLocationCount,
        @PositiveOrZero Integer targetPassedWithoutSelectionCount,
        @PositiveOrZero Integer pauseCount,
        @PositiveOrZero Long pauseDurationMs,
        @PositiveOrZero Integer requiredQuantity,
        @PositiveOrZero Integer selectedQuantity,
        @PositiveOrZero Long priceAmount,
        @PositiveOrZero Long budgetAmount,
        @PositiveOrZero Long paymentAmount,
        String itemId,
        String paymentMethod,
        String substituteItemId
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.SHOPPING;
    }
}
