package oneuldo.behaviorlog.domain.payload;

/** Structural telemetry checks, without inferring ability or a checkout submission. */
public final class ShoppingTimingContract {
    private ShoppingTimingContract() {}

    public static String invalidReason(String eventCode, BehaviorPayload payload) {
        boolean started = "SHOP.TIME_LIMIT_STARTED".equals(eventCode);
        boolean expired = "SHOP.TIME_LIMIT_EXPIRED".equals(eventCode);
        var timing = payload instanceof ShoppingBehaviorPayload shopping ? shopping.timing() : null;
        if (timing == null) return started || expired ? "MISSING_TIME_STATE" : null;
        String invalid = timing.invalidReason();
        if (invalid != null) return invalid;
        if ((started || expired) && timing.startedAt() == null) return "MISSING_TIME_START";
        if (started && Boolean.TRUE.equals(timing.expired())) return "STARTED_TIME_ALREADY_EXPIRED";
        if (expired && !Boolean.TRUE.equals(timing.expired())) return "EXPIRED_TIME_NOT_EXPIRED";
        return null;
    }
}
