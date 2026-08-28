package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record IdentityContext(
        @NotNull UUID sessionId
) {
}
