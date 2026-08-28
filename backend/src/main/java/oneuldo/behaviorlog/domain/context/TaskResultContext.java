package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record TaskResultContext(
        @NotNull Boolean taskCompleted,
        @DecimalMin("0.0") @DecimalMax("100.0") Double completionQuality,
        @PositiveOrZero Long completionTimeMs
) {
}
