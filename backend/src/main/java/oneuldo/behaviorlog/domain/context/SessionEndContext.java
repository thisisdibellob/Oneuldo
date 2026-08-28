package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.SessionEndReason;

public record SessionEndContext(
        @NotNull SessionEndReason reason,
        @PositiveOrZero Integer interruptionCount,
        @PositiveOrZero Long interruptionTimeMs
) {
}
