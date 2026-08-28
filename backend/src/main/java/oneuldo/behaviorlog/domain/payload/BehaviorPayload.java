package oneuldo.behaviorlog.domain.payload;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;

@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.PROPERTY,
        property = "type"
)
@JsonSubTypes({
        @JsonSubTypes.Type(value = PassivePlayBehaviorPayload.class, name = "PASSIVE_PLAY"),
        @JsonSubTypes.Type(value = ShoppingBehaviorPayload.class, name = "SHOPPING"),
        @JsonSubTypes.Type(value = CookingBehaviorPayload.class, name = "COOKING"),
        @JsonSubTypes.Type(value = HygieneClothingBehaviorPayload.class, name = "HYGIENE_CLOTHING"),
        @JsonSubTypes.Type(value = HouseholdBehaviorPayload.class, name = "HOUSEHOLD"),
        @JsonSubTypes.Type(value = KioskAtmBehaviorPayload.class, name = "KIOSK_ATM"),
        @JsonSubTypes.Type(value = SafetyBehaviorPayload.class, name = "SAFETY"),
        @JsonSubTypes.Type(value = WorkBehaviorPayload.class, name = "WORK")
})
public interface BehaviorPayload {

    BehaviorPayloadType type();
}
