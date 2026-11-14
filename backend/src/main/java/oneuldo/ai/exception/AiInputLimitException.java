package oneuldo.ai.exception;

/** A local request-size failure, before queue admission or inference. */
public final class AiInputLimitException extends IllegalArgumentException {
    private final int required;
    private final int limit;
    public AiInputLimitException(String stage, int required, int limit) {
        super(stage + ": required=" + required + ", limit=" + limit);
        this.required = required;
        this.limit = limit;
    }
    public int required() { return required; }
    public int limit() { return limit; }
}
