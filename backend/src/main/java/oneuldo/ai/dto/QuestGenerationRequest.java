package oneuldo.ai.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record QuestGenerationRequest(
        @NotNull UUID questId,
        @NotNull UUID stepId,
        @NotBlank @Size(max = 100) String requestId,
        @NotBlank @Size(max = 64) String incidentType,
        @Size(max = 64) String retryFailureCode
) {
}
