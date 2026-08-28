package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.NotNull;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.TextLevel;

public record AccessibilityContext(
        @NotNull InstructionMode instructionMode,
        @NotNull TextLevel textLevel,
        @NotNull Boolean audioEnabled,
        @NotNull Boolean symbolSupport,
        @NotNull ControllerMode controllerMode
) {
}
