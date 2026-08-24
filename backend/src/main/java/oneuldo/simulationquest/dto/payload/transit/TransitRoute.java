package oneuldo.simulationquest.dto.payload.transit;

import java.util.List;

public record TransitRoute(
        String routeCode,
        String displayName,
        List<String> stopCodes
) {
}
