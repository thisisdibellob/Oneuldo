package oneuldo.simulationquest.dto.payload;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import oneuldo.simulationquest.dto.payload.conversation.ConversationSimulationPayload;
import oneuldo.simulationquest.dto.payload.cooking.CookingSimulationPayload;
import oneuldo.simulationquest.dto.payload.shopping.ShoppingSimulationPayload;
import oneuldo.simulationquest.dto.payload.transit.TransitSimulationPayload;

@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.PROPERTY,
        property = "type"
)
@JsonSubTypes({
        @JsonSubTypes.Type(value = ShoppingSimulationPayload.class, name = "SHOPPING"),
        @JsonSubTypes.Type(value = TransitSimulationPayload.class, name = "TRANSIT"),
        @JsonSubTypes.Type(value = CookingSimulationPayload.class, name = "COOKING"),
        @JsonSubTypes.Type(value = ConversationSimulationPayload.class, name = "CONVERSATION")
})
public interface SimulationPayload {

    SimulationType type();
}
