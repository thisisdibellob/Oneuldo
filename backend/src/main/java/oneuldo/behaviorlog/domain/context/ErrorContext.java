package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.PositiveOrZero;
import oneuldo.behaviorlog.domain.type.PostErrorAction;

public record ErrorContext(
        @PositiveOrZero Integer omissionCount,
        @PositiveOrZero Integer repetitionCount,
        @PositiveOrZero Integer wrongActionCount,
        @PositiveOrZero Integer sequenceErrorCount,
        @PositiveOrZero Integer retryCount,
        Boolean selfCorrected,
        @PositiveOrZero Long selfCorrectionLatencyMs,
        @PositiveOrZero Integer idleCount,
        @PositiveOrZero Long idleTimeMs,
        PostErrorAction postErrorAction
) {
}
