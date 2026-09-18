package oneuldo.ai.exception;

/** Safe structured diagnostics: no request body, credentials, URL query or provider response body. */
public final class AiTransportException extends CloudAiUnavailableException {
    public enum Code {
        AI_CONNECT_TIMEOUT, AI_CONNECT_FAILED, AI_DNS_FAILED, AI_TLS_FAILED,
        AI_RESPONSE_TIMEOUT, AI_AUTH_FAILED, AI_RATE_LIMITED, AI_SERVER_ERROR,
        AI_REQUEST_REJECTED, AI_TRANSPORT_ERROR, AI_INVALID_RESPONSE,
        AI_QUEUE_FULL, AI_QUEUE_TIMEOUT, AI_INTERRUPTED
    }
    public record Details(String requestId, String stage, String causeType, Integer httpStatus,
                          int attempts, long elapsedMs) {}
    private final Code code;
    private final Details details;
    public AiTransportException(Code code, Details details, Throwable cause) {
        super(code.name(), cause);
        this.code = code;
        this.details = details;
    }
    public Code code() { return code; }
    public Details details() { return details; }
    public static boolean isCode(String value) {
        if (value == null) return false;
        try { Code.valueOf(value); return true; } catch (IllegalArgumentException ignored) { return false; }
    }
}
