package oneuldo.behaviorlog.profile.domain;

import java.time.Instant;
import java.util.UUID;

public record BehaviorProfileResponse(
        UUID profileId,
        int inputEventCount,
        BehaviorProfileData profileData,
        Instant generatedAt
) {
    public static BehaviorProfileResponse from(BehaviorProfileSnapshot snapshot) {
        return new BehaviorProfileResponse(
                snapshot.getId(),
                snapshot.getInputEventCount(),
                snapshot.getProfileData(),
                snapshot.getGeneratedAt()
        );
    }
}
