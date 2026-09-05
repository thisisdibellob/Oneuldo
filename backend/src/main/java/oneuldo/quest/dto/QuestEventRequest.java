package oneuldo.quest.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

// 선택과 클라이언트가 보고한 표시 내용을 저장한다. 서버는 정답을 판정하지 않는다.
public record QuestEventRequest(
        @NotNull UUID stepId,
        @NotNull UUID choiceId,
        @Min(1) int attemptNumber,
        boolean hintUsed,
        @Min(0) long responseTimeMs,
        java.util.Map<String, Object> presentedContent
) {
    public QuestEventRequest(UUID stepId, UUID choiceId, int attemptNumber, boolean hintUsed, long responseTimeMs) {
        this(stepId, choiceId, attemptNumber, hintUsed, responseTimeMs, null);
    }
}
