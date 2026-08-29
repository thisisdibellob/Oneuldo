package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.EvidenceContext;

public record TaskContext(
        @NotBlank String gameId,
        @NotNull UUID taskId,
        @NotBlank String taskVersion,
        @PositiveOrZero Integer difficulty,
        String scenarioVariant,
        @NotNull EvidenceContext evidenceContext
) {
}
