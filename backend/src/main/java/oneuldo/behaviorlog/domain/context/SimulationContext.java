package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.ContentSource;

public record SimulationContext(
        @NotNull UUID questInstanceId,
        @NotNull ContentSource contentSource,
        Boolean simulationStarted
) {
}
