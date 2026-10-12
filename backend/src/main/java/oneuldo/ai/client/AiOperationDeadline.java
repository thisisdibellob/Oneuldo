package oneuldo.ai.client;

import java.time.Duration;

/** One budget for a multi-call operation, including admission and repairs. */
public final class AiOperationDeadline implements AutoCloseable {
    private static final ThreadLocal<Long> DEADLINE = new ThreadLocal<>();
    private final Long previous;
    public AiOperationDeadline(Duration duration) { previous=DEADLINE.get();DEADLINE.set(System.nanoTime()+duration.toNanos()); }
    public static Duration remaining() {
        var end=DEADLINE.get(); if(end==null)return null;
        long n=end-System.nanoTime();
        if(n<=0 || Thread.currentThread().isInterrupted())throw new IllegalStateException("QUEST_GENERATION_TIMEOUT");
        return Duration.ofNanos(n);
    }
    public void close(){if(previous==null)DEADLINE.remove();else DEADLINE.set(previous);}
}
