package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.StepOutcome;

public record ActionContext(
        @NotBlank String eventCode,
        @NotBlank String microActionId,
        UUID stepId,
        StepOutcome stepOutcome,
        @PositiveOrZero Integer stepOrder,
        @PositiveOrZero Long startLatencyMs,
        String firstAction
) {
}
