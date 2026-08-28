package oneuldo.behaviorlog.domain.payload;

import java.util.List;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.domain.type.PrivateInformationType;
import oneuldo.behaviorlog.domain.type.SafetyStatus;

public record SafetyBehaviorPayload(
        String signalState,
        String selectedExitId,
        String helperType,
        String emergencyContactType,
        Boolean vehicleChecked,
        Boolean unsafeGapSelected,
        Boolean crossingCancelled,
        Boolean requestRefused,
        List<PrivateInformationType> disclosedInformationTypes,
        SafetyStatus safetyStatus
) implements BehaviorPayload {

    @Override
    public BehaviorPayloadType type() {
        return BehaviorPayloadType.SAFETY;
    }
}
