package oneuldo.behaviorlog.domain.type;

public enum SessionEndReason {
    COMPLETED,
    USER_ABORTED,
    APP_BACKGROUNDED,
    APP_TERMINATED,
    NETWORK_ERROR,
    TECHNICAL_ERROR,
    TIMEOUT,
    OTHER
}
