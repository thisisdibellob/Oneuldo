package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import oneuldo.behaviorlog.analysis.service.AnalysisCallPacer;
import org.junit.jupiter.api.Test;

class AnalysisCallPacerTest {
    @Test void 작은요청은_즉시_허용하고_예약과_실사용량으로_초과를_예방한다() {
        var time=new AtomicLong(1000);var pacer=new AnalysisCallPacer(time::get);
        var first=pacer.acquire(1000,900);
        assertThat(pacer.delayMillis(1000,900)).isZero();
        assertThat(pacer.delayMillis(6000,900)).isEqualTo(61000);
        pacer.completed(first,1000,300,Map.of());
        assertThat(pacer.delayMillis(4700,900)).isZero();
        time.addAndGet(61000);assertThat(pacer.delayMillis(6000,900)).isZero();
        assertThatThrownBy(()->pacer.delayMillis(7000,900)).hasMessage("REQUEST_EXCEEDS_RATE_CAPACITY");
    }
    @Test void 공급자_남은토큰과_별도출력한도_및_retry_after를_존중한다() {
        var time=new AtomicLong(1000);var pacer=new AnalysisCallPacer(time::get);
        var first=pacer.acquire(1000,900);
        pacer.completed(first,1000,300,Map.of("X-Ratelimit-Limit-Tokens","8000","X-Ratelimit-Remaining-Tokens","100","X-Ratelimit-Reset-Tokens","2.5s"));
        assertThat(pacer.delayMillis(500,100)).isEqualTo(2500);
        time.addAndGet(3000);
        pacer.limited(Map.of("retry-after","10"),"output tokens per minute Limit 1000 Requested 1200");
        assertThat(pacer.delayMillis(100,500)).isEqualTo(10000);
        assertThat(pacer.delayMillis(100,900)).isEqualTo(58000);
        assertThatThrownBy(()->pacer.delayMillis(100,1200)).hasMessage("REQUEST_EXCEEDS_RATE_CAPACITY");
    }
    @Test void 단위변환과_하루한도_소진을_분당요청한도로_착각하지_않는다() {
        assertThat(AnalysisCallPacer.durationMillis("2m59.56s")).isEqualTo(179560);
        var pacer=new AnalysisCallPacer(()->1000);
        var first=pacer.acquire(1,1);
        pacer.completed(first,1,1,Map.of("x-ratelimit-remaining-requests","0","x-ratelimit-reset-requests","1h"));
        assertThatThrownBy(()->pacer.acquire(1,1)).isInstanceOf(oneuldo.ai.exception.CloudAiRateLimitException.class);
    }
}
