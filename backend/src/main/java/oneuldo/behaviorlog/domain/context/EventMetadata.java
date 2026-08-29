package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Instant;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.DevicePerformanceClass;

public record EventMetadata(
        @NotNull UUID clientEventId,
        @NotNull @Positive Long eventSequence,
        @NotBlank String eventSchemaVersion,
        @NotBlank String appVersion,
        @NotBlank String contentVersion,
        Boolean offlineQueued,
        DevicePerformanceClass devicePerformanceClass,
        @NotNull Instant occurredAt
) {
}
