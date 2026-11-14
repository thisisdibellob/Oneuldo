package oneuldo.behaviorlog.domain.payload;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.Instant;
import oneuldo.behaviorlog.personalization.service.MarketQuestTimePolicy;

/** Optional for historical logs; boxed values keep missing fields distinct from zero. */
public record ShoppingTimingContext(
        @NotNull Integer timeLimitSeconds,
        @NotBlank String policyVersion,
        Instant startedAt,
        @NotNull @PositiveOrZero Long elapsedMs,
        @NotNull @PositiveOrZero Long remainingMs,
        @NotNull Boolean expired,
        @NotNull @Pattern(regexp = "WALL_CLOCK") String clockBasis
) {
    @JsonIgnore
    @AssertTrue(message = "장보기 시간 상태가 시간 정책과 일치하지 않습니다.")
    public boolean isConsistent() {
        return invalidReason() == null;
    }

    public String invalidReason() {
        if (timeLimitSeconds == null || timeLimitSeconds < MarketQuestTimePolicy.MINIMUM_SECONDS
                || timeLimitSeconds > MarketQuestTimePolicy.MAXIMUM_SECONDS) return "TIME_LIMIT_OUT_OF_POLICY";
        if (policyVersion == null || policyVersion.isBlank()) return "MISSING_TIME_POLICY_VERSION";
        if (!"WALL_CLOCK".equals(clockBasis)) return "INVALID_TIME_CLOCK_BASIS";
        if (elapsedMs == null || remainingMs == null || expired == null) return "MISSING_TIME_STATE";
        if (elapsedMs < 0 || remainingMs < 0) return "NEGATIVE_TIME_STATE";
        long limitMs = timeLimitSeconds.longValue() * 1000L;
        if (remainingMs != Math.max(0L, limitMs - elapsedMs)
                || expired != (elapsedMs >= limitMs)) return "INCONSISTENT_TIME_STATE";
        if (startedAt == null && elapsedMs != 0L) return "MISSING_TIME_START";
        return null;
    }
}
