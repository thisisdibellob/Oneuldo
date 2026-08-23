package oneuldo.ai.exception;

public class CloudAiUnavailableException extends RuntimeException {

    public CloudAiUnavailableException(String message) {
        super(message);
    }

    public CloudAiUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
