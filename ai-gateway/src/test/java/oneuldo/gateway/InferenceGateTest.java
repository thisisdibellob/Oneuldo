package oneuldo.gateway;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class InferenceGateTest {
    GatewaySettings settings(int queue, Duration wait) {
        return new GatewaySettings(URI.create("http://127.0.0.1:11434"), Duration.ofMinutes(15), wait, queue, Map.of("team", "a".repeat(64)));
    }
    @Test void serializesDifferentTeamsAndRejectsDuplicateKey() throws Exception {
        var gate = new InferenceGate(settings(1, Duration.ofSeconds(3)));
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var secondStarted = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> gate.run("a", () -> { entered.countDown(); try { release.await(3, TimeUnit.SECONDS); } catch (InterruptedException e) { throw new RuntimeException(e); } return "first"; }));
            try {
                assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> gate.run("a", () -> "bad")).isInstanceOf(ResponseStatusException.class).hasMessageContaining("KEY_BUSY");
                var second = executor.submit(() -> gate.run("b", () -> { secondStarted.countDown(); return "second"; }));
                assertThat(secondStarted.await(100, TimeUnit.MILLISECONDS)).isFalse();
                release.countDown();
                assertThat(first.get(3, TimeUnit.SECONDS)).isEqualTo("first");
                assertThat(second.get(3, TimeUnit.SECONDS)).isEqualTo("second");
            } finally { release.countDown(); }
        }
    }
    @Test void boundsQueueAndReleasesAdmissionAfterFailure() throws Exception {
        for (int queue : new int[]{0, 1}) {
            var gate = new InferenceGate(settings(queue, Duration.ZERO));
            var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var running = executor.submit(() -> gate.run("a", () -> { entered.countDown(); try { release.await(3, TimeUnit.SECONDS); } catch (InterruptedException e) { throw new RuntimeException(e); } throw new IllegalStateException("upstream"); }));
                try {
                    assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> gate.run("b", () -> "bad")).hasMessageContaining(queue == 0 ? "QUEUE_FULL" : "QUEUE_TIMEOUT");
                } finally { release.countDown(); }
                assertThatThrownBy(() -> running.get(3, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
                assertThat(gate.run("a", () -> "recovered")).isEqualTo("recovered");
                assertThat(gate.run("b", () -> "recovered")).isEqualTo("recovered");
            }
        }
    }
    @Test void failsClosedWithoutConfiguredKeys() {
        assertThatThrownBy(() -> new GatewaySettings(URI.create("http://127.0.0.1:11434"), Duration.ofSeconds(5), Duration.ZERO, 1, Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
