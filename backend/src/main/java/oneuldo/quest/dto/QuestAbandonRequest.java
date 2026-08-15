package oneuldo.quest.dto;

import jakarta.validation.constraints.Size;

public record QuestAbandonRequest(
        @Size(max = 50) String reason
) {
}
