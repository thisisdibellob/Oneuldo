package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

public record HouseholdBehaviorPayload(
        String laundryItemId,
        String classificationCode,
        String machineMode,
        String wasteType,
        @PositiveOrZero Double detergentAmount,
        @DecimalMin("0.0") @DecimalMax("1.0") Double cleaningCoverageRate,
        Boolean pocketChecked,
        Boolean applianceTurnedOff,
        Boolean doorLocked
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.HOUSEHOLD;
    }
}
