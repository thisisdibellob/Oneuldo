package oneuldo.gateway;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> status(ResponseStatusException e) {
        var builder = ResponseEntity.status(e.getStatusCode());
        if (e.getStatusCode().value() == 429) builder.header("Retry-After", "30");
        return builder.body(Map.of("error", e.getReason() == null ? "REQUEST_FAILED" : e.getReason()));
    }
}
