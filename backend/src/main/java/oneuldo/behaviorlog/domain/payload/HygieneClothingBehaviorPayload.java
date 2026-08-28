package oneuldo.behaviorlog.domain.payload;

import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

public record HygieneClothingBehaviorPayload(
        String hygieneTaskId,
        String toolId,
        String clothingItemId,
        String weatherType,
        String activityContext,
        Boolean stepCompleted,
        Boolean privacyRuleCompleted,
        Boolean breakRequested
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.HYGIENE_CLOTHING;
    }
}
