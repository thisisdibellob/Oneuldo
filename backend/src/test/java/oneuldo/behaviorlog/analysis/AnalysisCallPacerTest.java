package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import oneuldo.behaviorlog.analysis.service.AnalysisCallPacer;
import org.junit.jupiter.api.Test;

class AnalysisCallPacerTest {
    @Test void successfulRequestsNeverTriggerSpeculativeWait() {
        var time=new AtomicLong(1000);var pacer=new AnalysisCallPacer(time::get);
        var first=pacer.acquire(6000,900);
        pacer.completed(first,6000,850,Map.of("x-ratelimit-remaining-tokens","0","x-ratelimit-reset-tokens","1m","x-ratelimit-remaining-requests","0"));
        assertThat(pacer.delayMillis(6000,900)).isZero();
        pacer.acquire(6000,900);
        assertThat(pacer.delayMillis(6000,900)).isZero();
    }
    @Test void actual429UsesRetryAfterAndAllowsRequestAtExpiry() {
        var time=new AtomicLong(1000);var pacer=new AnalysisCallPacer(time::get);
        pacer.limited(Map.of("Retry-After","2.5"),"tokens per minute");
        assertThat(pacer.delayMillis(6000,900)).isEqualTo(2500);
        time.addAndGet(2500);
        assertThat(pacer.delayMillis(6000,900)).isZero();
    }
    @Test void usesBodyHintThenResetHeaderThenFallback() {
        var pacer=new AnalysisCallPacer(()->1000);
        pacer.limited(Map.of(),"Please try again in 3.2s.");
        assertThat(pacer.delayMillis(1,1)).isEqualTo(3200);
        pacer.limited(Map.of("x-ratelimit-reset-tokens","5s"),"");
        assertThat(pacer.delayMillis(1,1)).isEqualTo(5000);
        pacer.limited(Map.of(),"");
        assertThat(pacer.delayMillis(1,1)).isEqualTo(61000);
    }
    @Test void longQuotaExhaustionDoesNotBlockWorkerForHours() {
        assertThat(AnalysisCallPacer.durationMillis("2m59.56s")).isEqualTo(179560);
        var pacer=new AnalysisCallPacer(()->1000);
        pacer.limited(Map.of("retry-after","3600"),"requests per day");
        assertThatThrownBy(()->pacer.acquire(1,1)).isInstanceOf(oneuldo.ai.exception.CloudAiRateLimitException.class);
    }
}
