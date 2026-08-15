package oneuldo.quest.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

// 클라이언트는 선택 정보만 보내고 정답 여부는 서버가 계산한다.
public record QuestEventRequest(
        @NotNull UUID stepId,
        @NotNull UUID choiceId,
        @Min(1) int attemptNumber,
        boolean hintUsed,
        @Min(0) long responseTimeMs
) {
}
