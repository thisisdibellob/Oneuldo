package oneuldo.ai.exception;

public class CloudAiRateLimitException extends RuntimeException {

    private final String retryAfter;

    public CloudAiRateLimitException(String retryAfter, Throwable cause) {
        super("클라우드 AI 사용 한도에 도달했습니다.", cause);
        this.retryAfter = retryAfter;
    }

    public String retryAfter() {
        return retryAfter;
    }
}
