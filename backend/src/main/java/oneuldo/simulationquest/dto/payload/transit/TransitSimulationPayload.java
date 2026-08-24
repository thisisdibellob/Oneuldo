package oneuldo.simulationquest.dto.payload.transit;

import java.util.List;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record TransitSimulationPayload(
        TransitStation origin,
        TransitStation destination,
        List<TransitRoute> routes,
        String correctRouteCode,
        String boardingStopCode,
        String exitStopCode,
        int fare
) implements SimulationPayload {

    @Override
    public SimulationType type() {
        return SimulationType.TRANSIT;
    }
}
