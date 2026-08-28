package oneuldo.behaviorlog.normalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLog;

@Entity
@Table(name = "behavior_normalization_attempts",
        uniqueConstraints = @UniqueConstraint(name = "uq_normalization_attempt_log_version",
                columnNames = {"behavior_log_id", "normalizer_version"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorNormalizationAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "behavior_log_id", nullable = false)
    private BehaviorLog behaviorLog;

    @Column(name = "normalizer_version", nullable = false, length = 50)
    private String normalizerVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NormalizationAttemptStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "manual_retry_count", nullable = false)
    private int manualRetryCount;

    @Column(name = "last_attempted_at", nullable = false)
    private Instant lastAttemptedAt;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_error_code", length = 100)
    private String lastErrorCode;

    @Column(name = "last_error_message", length = 1000)
    private String lastErrorMessage;

    @Column(name = "completed_at")
    private Instant completedAt;

    public BehaviorNormalizationAttempt(BehaviorLog behaviorLog, String normalizerVersion, Instant now) {
        this.behaviorLog = Objects.requireNonNull(behaviorLog);
        this.normalizerVersion = Objects.requireNonNull(normalizerVersion);
        begin(now);
    }

    public void begin(Instant now) {
        status = NormalizationAttemptStatus.PROCESSING;
        attemptCount++;
        lastAttemptedAt = Objects.requireNonNull(now);
        nextRetryAt = null;
    }

    public void complete(Instant now) {
        status = NormalizationAttemptStatus.COMPLETED;
        completedAt = Objects.requireNonNull(now);
        nextRetryAt = null;
        lastErrorCode = null;
        lastErrorMessage = null;
    }

    public void fail(Throwable throwable, Instant now, int maxAttempts) {
        lastErrorCode = throwable.getClass().getSimpleName();
        String message = throwable.getMessage();
        lastErrorMessage = message == null ? null : message.substring(0, Math.min(message.length(), 1000));
        if (attemptCount >= maxAttempts) {
            status = NormalizationAttemptStatus.DEAD_LETTER;
            nextRetryAt = null;
            return;
        }
        status = NormalizationAttemptStatus.RETRY;
        long delaySeconds = Math.min(3600, 30L * (1L << Math.min(attemptCount - 1, 7)));
        nextRetryAt = now.plus(Duration.ofSeconds(delaySeconds));
    }

    public void requestManualRetry(Instant now) {
        status = NormalizationAttemptStatus.RETRY;
        attemptCount = 0;
        manualRetryCount++;
        nextRetryAt = Objects.requireNonNull(now);
        completedAt = null;
    }
}
