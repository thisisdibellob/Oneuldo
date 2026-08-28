package oneuldo.behaviorlog.domain.payload;

import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

public record KioskAtmBehaviorPayload(
        String menuId,
        String itemId,
        String transactionType,
        String counterId,
        @PositiveOrZero Integer quantity,
        @PositiveOrZero Long amount,
        @PositiveOrZero Long budget,
        @PositiveOrZero Long balance,
        Boolean pinPrivacyChecked,
        Boolean receiptCollected,
        Boolean cardRetrieved
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.KIOSK_ATM;
    }
}
