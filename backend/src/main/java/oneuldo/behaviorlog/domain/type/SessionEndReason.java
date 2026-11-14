package oneuldo.behaviorlog.domain.type;

public enum SessionEndReason {
    COMPLETED,
    FLOW_FINISHED,
    EXIT_AFTER_SUBMISSION,
    USER_ABORTED,
    APP_BACKGROUNDED,
    APP_TERMINATED,
    NETWORK_ERROR,
    TECHNICAL_ERROR,
    TIME_LIMIT_EXPIRED,
    TIMEOUT,
    OTHER
}
