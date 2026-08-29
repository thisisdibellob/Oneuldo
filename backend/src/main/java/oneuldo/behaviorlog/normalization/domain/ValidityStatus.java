package oneuldo.behaviorlog.normalization.domain;

public enum ValidityStatus {
    VALID,
    INVALID_TECHNICAL,
    INVALID_ACCESSIBILITY,
    INVALID_LANGUAGE_ACCESS,
    INVALID_ASSISTANT_INTERVENTION,
    INVALID_PAYLOAD,
    UNKNOWN_EVENT_CODE,
    REVIEW_REQUIRED
}
