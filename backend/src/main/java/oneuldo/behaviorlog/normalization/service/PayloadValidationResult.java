package oneuldo.behaviorlog.normalization.service;

import java.util.List;
import oneuldo.behaviorlog.normalization.domain.NormalizationIssue;

public record PayloadValidationResult(List<NormalizationIssue> issues) {
    public PayloadValidationResult {
        issues = List.copyOf(issues);
    }

    public boolean valid() {
        return issues.isEmpty();
    }
}
