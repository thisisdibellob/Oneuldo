package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.SupportType;

public record SupportContext(
        @Min(0) @Max(3) Integer promptLevel,
        SupportType supportType,
        @PositiveOrZero Integer supportCount,
        Boolean helpRequested,
        String helpRequestTarget,
        @PositiveOrZero Long helpRequestLatencyMs,
        StepOutcome resultBeforeSupport,
        StepOutcome resultAfterSupport,
        @Min(0) @Max(3) Integer nextAttemptPromptLevel,
        Boolean laterIndependentCompletion
) {
}
