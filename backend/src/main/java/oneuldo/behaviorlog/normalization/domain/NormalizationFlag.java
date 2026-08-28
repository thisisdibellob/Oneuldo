package oneuldo.behaviorlog.normalization.domain;

public enum NormalizationFlag {
    SEQUENCE_GAP,
    LATE_ARRIVAL,
    CLOCK_SKEW,
    OFFLINE_QUEUED,
    MISSING_OPTIONAL_CONTEXT,
    FALLBACK_CONTENT,
    SELF_CORRECTED,
    NEAR_MISS,
    VALUE_OUTLIER
}
