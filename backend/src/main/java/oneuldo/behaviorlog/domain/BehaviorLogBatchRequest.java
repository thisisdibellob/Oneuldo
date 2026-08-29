package oneuldo.behaviorlog.domain;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 네트워크 재연결 시 여러 행동 이벤트를 발생 순서대로 전송하는 요청이다. */
public record BehaviorLogBatchRequest(
        @NotNull UUID batchId,
        @NotEmpty @Size(max = 100) List<@Valid BehaviorLogRequest> events
) {
}
