package oneuldo.gateway;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** One shared upstream call, bounded waiting, at most one outstanding call per team key. */
@Component
public class InferenceGate {
    private final GatewaySettings settings;
    private final Semaphore admission;
    private final Semaphore execution = new Semaphore(1, true);
    private final Set<String> pending = ConcurrentHashMap.newKeySet();
    public InferenceGate(GatewaySettings settings) {
        this.settings = settings; admission = new Semaphore(settings.maxQueued() + 1);
    }
    public <T> T run(String identity, Supplier<T> action) {
        if (!pending.add(identity)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "KEY_BUSY");
        boolean admitted = false, acquired = false;
        try {
            admitted = admission.tryAcquire();
            if (!admitted) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "QUEUE_FULL");
            acquired = execution.tryAcquire(settings.queueTimeout().toMillis(), TimeUnit.MILLISECONDS);
            if (!acquired) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "QUEUE_TIMEOUT");
            return action.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "REQUEST_INTERRUPTED");
        } finally {
            if (acquired) execution.release();
            if (admitted) admission.release();
            pending.remove(identity);
        }
    }
}
