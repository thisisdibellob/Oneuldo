package oneuldo.behaviorlog.normalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.normalization.domain.BehaviorNormalizationAttempt;
import oneuldo.behaviorlog.normalization.domain.NormalizationAttemptStatus;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationAttemptService;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import org.junit.jupiter.api.Test;

class BehaviorNormalizationAttemptTest {

    @Test
    void 실패를_지수_백오프로_재시도하고_최대_횟수_후_dead_letter로_전환한다() {
        Instant now = Instant.parse("2026-08-28T10:00:00Z");
        var attempt = new BehaviorNormalizationAttempt(
                mock(BehaviorLog.class), BehaviorNormalizationService.NORMALIZER_VERSION, now);

        attempt.fail(new IllegalStateException("규칙 오류"), now,
                BehaviorNormalizationAttemptService.MAX_ATTEMPTS);

        assertEquals(NormalizationAttemptStatus.RETRY, attempt.getStatus());
        assertNotNull(attempt.getNextRetryAt());
        assertEquals("IllegalStateException", attempt.getLastErrorCode());

        for (int count = 2; count <= BehaviorNormalizationAttemptService.MAX_ATTEMPTS; count++) {
            attempt.begin(now.plusSeconds(count));
            attempt.fail(new IllegalStateException("규칙 오류"), now.plusSeconds(count),
                    BehaviorNormalizationAttemptService.MAX_ATTEMPTS);
        }

        assertEquals(NormalizationAttemptStatus.DEAD_LETTER, attempt.getStatus());
        assertEquals(BehaviorNormalizationAttemptService.MAX_ATTEMPTS, attempt.getAttemptCount());
        assertEquals(null, attempt.getNextRetryAt());

        attempt.requestManualRetry(now.plusSeconds(100));
        assertEquals(NormalizationAttemptStatus.RETRY, attempt.getStatus());
        assertEquals(0, attempt.getAttemptCount());
        assertEquals(1, attempt.getManualRetryCount());
    }
}
