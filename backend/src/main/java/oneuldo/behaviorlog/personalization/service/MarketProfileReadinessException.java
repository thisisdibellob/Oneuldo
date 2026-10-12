package oneuldo.behaviorlog.personalization.service;

/** Data readiness only. It does not grade the player or select a difficulty. */
public final class MarketProfileReadinessException extends RuntimeException {
    private final boolean pending;
    private final String stage;

    public MarketProfileReadinessException(boolean pending, String stage, String message) {
        super(message);
        this.pending = pending;
        this.stage = stage;
    }

    public boolean pending() { return pending; }
    public String stage() { return stage; }
    public String code() { return pending ? "LATEST_PLAY_PROFILE_PENDING" : "LATEST_PLAY_PROFILE_FAILED"; }
}
