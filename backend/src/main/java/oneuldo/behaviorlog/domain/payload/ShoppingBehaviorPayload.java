package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;
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
        String substituteItemId,
        String thresholdRuleVersion,
        @PositiveOrZero Double straightDistance,
        @PositiveOrZero Double travelDistance,
        @PositiveOrZero Integer objectiveCount,
        @PositiveOrZero Integer briefingIndex,
        String stationId,
        @PositiveOrZero Integer visitIndex,
        Boolean isTargetZone,
        @PositiveOrZero Long intervalSinceLastVisitMs,
        @PositiveOrZero Long durationMs,
        @PositiveOrZero Long proximityDurationMs,
        Boolean shelfOpened,
        Boolean hasRemainingTarget,
        Double x,
        Double y,
        String controlMode,
        @PositiveOrZero Integer blockedCount,
        @PositiveOrZero Long observationWindowMs,
        List<String> stationSequence,
        @PositiveOrZero Long idleThresholdMs,
        @PositiveOrZero Long idleDurationMs,
        String resumedByEventCode,
        @PositiveOrZero Long interruptionDurationMs,
        @PositiveOrZero Integer cartItemCount,
        @PositiveOrZero Long cartTotalAmount,
        Long remainingBudgetAmount,
        @PositiveOrZero Integer remainingObjectiveCount,
        List<String> missingItemIds,
        List<String> wrongItemIds,
        @PositiveOrZero Long overBudgetAmount,
        @PositiveOrZero Integer quantityBefore,
        @PositiveOrZero Integer quantityAfter,
        Boolean isObjectiveItem
) implements BehaviorPayload {

    /** 기존 서버 내부 생성 코드가 사용하던 payload 생성 계약을 유지한다. */
    public ShoppingBehaviorPayload(
            Double pathDistance,
            Double shortestPossibleDistance,
            Double pathEfficiency,
            Integer listOpenCount,
            Integer wrongAisleCount,
            Integer backtrackingCount,
            Integer repeatedLocationCount,
            Integer targetPassedWithoutSelectionCount,
            Integer pauseCount,
            Long pauseDurationMs,
            Integer requiredQuantity,
            Integer selectedQuantity,
            Long priceAmount,
            Long budgetAmount,
            Long paymentAmount,
            String itemId,
            String paymentMethod,
            String substituteItemId
    ) {
        this(pathDistance, shortestPossibleDistance, pathEfficiency, listOpenCount,
                wrongAisleCount, backtrackingCount, repeatedLocationCount,
                targetPassedWithoutSelectionCount, pauseCount, pauseDurationMs,
                requiredQuantity, selectedQuantity, priceAmount, budgetAmount,
                paymentAmount, itemId, paymentMethod, substituteItemId,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null);
    }

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.SHOPPING;
    }
}
