package oneuldo.simulationquest.dto.payload.conversation;

import java.util.List;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record ConversationSimulationPayload(
        List<String> participantIds,
        String objective
) implements SimulationPayload {

    @Override
    public SimulationType type() {
        return SimulationType.CONVERSATION;
    }
}
