package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.domain.type.InstructionMode;

public record WorkBehaviorPayload(
        InstructionMode instructionMode,
        String workItemId,
        String taskChangeType,
        @PositiveOrZero Integer requiredQuantity,
        @PositiveOrZero Integer completedQuantity,
        @PositiveOrZero Integer defectCount,
        Boolean qualityChecked,
        Boolean defectDetected,
        Boolean changeAccepted,
        Boolean safetyRuleChecked
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.WORK;
    }
}
