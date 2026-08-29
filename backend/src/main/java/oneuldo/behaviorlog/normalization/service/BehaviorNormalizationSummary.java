package oneuldo.behaviorlog.normalization.service;

public record BehaviorNormalizationSummary(
        long rawLogCount,
        long normalizedCount,
        long quarantinedCount,
        long retryCount,
        long deadLetterCount,
        long openSessionWithGapsCount,
        long finalizedGappedSessionCount
) {
}
