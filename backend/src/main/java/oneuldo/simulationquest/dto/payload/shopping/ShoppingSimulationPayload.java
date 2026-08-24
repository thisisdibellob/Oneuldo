package oneuldo.simulationquest.dto.payload.shopping;

import java.util.List;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record ShoppingSimulationPayload(
        int budget,
        String currency,
        List<ShoppingObjective> objectives,
        List<ShoppingCategory> categories,
        List<ShoppingProduct> products
) implements SimulationPayload {

    @Override
    public SimulationType type() {
        return SimulationType.SHOPPING;
    }
}
