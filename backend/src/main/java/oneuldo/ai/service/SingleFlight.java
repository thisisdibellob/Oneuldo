package oneuldo.ai.service;

import java.util.concurrent.*;
import java.util.function.Supplier;

/** Shares an active operation, not an arbitrary cached result. Keys must include the authenticated owner. */
public final class SingleFlight<K,V> {
    private final ConcurrentMap<K,CompletableFuture<V>> running = new ConcurrentHashMap<>();
    public V run(K key, Supplier<V> operation) {
        var mine = new CompletableFuture<V>();
        var existing = running.putIfAbsent(key,mine);
        if(existing != null) {
            try { return existing.get(); }
            catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("AI_WAIT_INTERRUPTED",e); }
            catch(ExecutionException e) { throw propagate(e.getCause()); }
        }
        try { V result=operation.get(); mine.complete(result); return result; }
        catch(Throwable failure) { mine.completeExceptionally(failure); throw propagate(failure); }
        finally { running.remove(key,mine); }
    }
    private RuntimeException propagate(Throwable failure) {
        if(failure instanceof Error error) throw error;
        return failure instanceof RuntimeException runtime ? runtime : new IllegalStateException(failure);
    }
}
