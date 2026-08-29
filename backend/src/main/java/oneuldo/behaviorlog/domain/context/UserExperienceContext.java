package oneuldo.behaviorlog.domain.context;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.SimulationFeedbackCode;
import oneuldo.behaviorlog.domain.type.SupportType;

public record UserExperienceContext(
        Integer perceivedDifficulty,
        @Size(max = 500) String comfortReport,
        SupportType preferredSupport,
        SimulationFeedbackCode simulationFeedbackCode,
        Boolean instructionUnderstood,
        @Min(1) @Max(5) Integer satisfactionRating,
        List<UUID> confusingStepIds,
        Boolean wouldRetry,
        @Size(max = 500) String feedbackNote
) {
}
