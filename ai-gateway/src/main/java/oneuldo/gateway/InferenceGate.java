package oneuldo.gateway;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Configurable bounded upstream work and per-key admission; defaults retain single-call fairness. */
@Component
public class InferenceGate {
    private final GatewaySettings settings;
    private final Semaphore admission;
    private final Semaphore execution;
    private final java.util.Map<String,Integer> pending = new ConcurrentHashMap<>();
    public InferenceGate(GatewaySettings settings) {
        this.settings = settings; execution=new Semaphore(settings.parallelism(),true);admission = new Semaphore(settings.maxQueued() + settings.parallelism());
    }
    public <T> T run(String identity, Supplier<T> action) {
        if (pending.merge(identity,1,Integer::sum)>settings.maxPerKey()) {
            pending.compute(identity,(k,n)->n==null||n<=1?null:n-1);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"KEY_BUSY");
        }
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
            pending.compute(identity,(k,n)->n==null||n<=1?null:n-1);
        }
    }
}
