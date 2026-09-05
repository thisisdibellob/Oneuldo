package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import oneuldo.ai.service.SingleFlight;
import org.junit.jupiter.api.Test;

class SingleFlightTest {
    @Test void 같은키의_동시호출은_한번만_수행하고_다른키는_독립적이다() throws Exception {
        var flights=new SingleFlight<String,String>();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var calls=new AtomicInteger();
        var owner=new FutureTask<>(()->flights.run("member-a",()->{calls.incrementAndGet();entered.countDown();await(release);return "result-a";}));
        var first=Thread.ofPlatform().start(owner);
        assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
        var joined=new FutureTask<>(()->flights.run("member-a",()->{calls.incrementAndGet();return "WRONG";}));
        var second=Thread.ofPlatform().start(joined);
        try {
            awaitWaiting(second);
            assertThat(flights.run("member-b",()->"result-b")).isEqualTo("result-b");
        } finally {release.countDown();}
        assertThat(owner.get(5,TimeUnit.SECONDS)).isEqualTo("result-a");
        assertThat(joined.get(5,TimeUnit.SECONDS)).isEqualTo("result-a");
        assertThat(calls).hasValue(1);
        assertThat(flights.run("member-a",()->"next-operation")).isEqualTo("next-operation");
        first.join(1000);second.join(1000);
    }

    @Test void 실패도_공유하지만_실패한키는_해제하여_재시도를_허용한다() throws Exception {
        var flights=new SingleFlight<String,String>();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var error=new IllegalStateException("provider failed");
        var owner=new FutureTask<>(()->flights.run("a",()->{entered.countDown();await(release);throw error;}));
        Thread.ofPlatform().start(owner);assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
        var follower=new FutureTask<>(()->flights.run("a",()->"must not run"));var thread=Thread.ofPlatform().start(follower);
        try {awaitWaiting(thread);} finally {release.countDown();}
        assertThatThrownBy(()->owner.get(5,TimeUnit.SECONDS)).hasCause(error);
        assertThatThrownBy(()->follower.get(5,TimeUnit.SECONDS)).hasCause(error);
        assertThat(flights.run("a",()->"retry succeeds")).isEqualTo("retry succeeds");
    }
    public static void awaitWaiting(Thread thread) throws InterruptedException {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(thread.getState()!=Thread.State.WAITING && System.nanoTime()<deadline) Thread.sleep(5);
        assertThat(thread.getState()).isEqualTo(Thread.State.WAITING);
    }
    private static void await(CountDownLatch latch) {
        try { if(!latch.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("test timeout"); }
        catch(InterruptedException e) {Thread.currentThread().interrupt();throw new IllegalStateException(e);}
    }
}
