package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record PresentationContext(
        @NotBlank String screenId,
        String instructionContentId,
        List<String> presentedChoiceIds,
        String hintContentId,
        @PositiveOrZero Long foregroundDurationMs,
        Boolean appBackgrounded,
        String renderErrorCode
) {
}
