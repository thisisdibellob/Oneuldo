package oneuldo.simulationquest.dto.payload.cooking;

import java.util.List;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record CookingSimulationPayload(
        List<CookingIngredient> ingredients,
        List<CookingStep> steps,
        List<String> requiredToolCodes,
        int timeLimitSeconds
) implements SimulationPayload {

    @Override
    public SimulationType type() {
        return SimulationType.COOKING;
    }
}
