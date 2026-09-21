package oneuldo.behaviorlog.analysis.service;

import java.util.List;

/** Mechanical reference mismatch only. Never carries source prose or rewrites an AI judgment. */
public final class ReviewEvidenceException extends IllegalArgumentException {
    public record Details(String code, String path, List<String> offendingIds) {
        public Details { offendingIds = List.copyOf(offendingIds); }
    }

    private final Details details;

    public ReviewEvidenceException(String code, String path, List<String> offendingIds) {
        super(code);
        details = new Details(code, path, offendingIds);
    }

    public Details details() { return details; }
}
