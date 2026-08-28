package oneuldo.behaviorlog.normalization.domain;

public enum NormalizationAttemptStatus {
    PROCESSING,
    COMPLETED,
    RETRY,
    DEAD_LETTER
}
