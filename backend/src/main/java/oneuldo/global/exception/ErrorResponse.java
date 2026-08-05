package oneuldo.global.exception;

public record ErrorResponse(
        String code,
        String message
) {
}
