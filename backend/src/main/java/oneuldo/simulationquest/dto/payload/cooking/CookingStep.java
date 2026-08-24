package oneuldo.simulationquest.dto.payload.cooking;

import java.util.List;

public record CookingStep(
        String id,
        int sequence,
        String instruction,
        List<String> requiredIngredientIds,
        List<String> requiredToolCodes
) {
}
