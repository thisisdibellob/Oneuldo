package oneuldo.behaviorlog.normalization.domain;

public record NormalizationIssue(
        String issueCode,
        String fieldPath,
        String message
) {
}
