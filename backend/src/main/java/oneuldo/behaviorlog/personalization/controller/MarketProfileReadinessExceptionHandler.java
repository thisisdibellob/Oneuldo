package oneuldo.behaviorlog.personalization.controller;

import oneuldo.behaviorlog.personalization.service.MarketProfileReadinessException;
import oneuldo.behaviorlog.personalization.service.MarketBaselineRequiredException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = MarketDifficultyRecommendationController.class)
public class MarketProfileReadinessExceptionHandler {
    public record Body(String code, String stage, String message) {}
    public record Availability(boolean submittedPlayAvailable, boolean readyProfileAvailable) {}
    public record BaselineBody(String code, String stage, String message, String source, Availability availability) {}

    @ExceptionHandler(MarketBaselineRequiredException.class)
    public ResponseEntity<BaselineBody> baseline(MarketBaselineRequiredException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new BaselineBody(
                "MARKET_BASELINE_REQUIRED", "FIRST_PLAY", exception.getMessage(), "STATIC", new Availability(false, false)));
    }

    @ExceptionHandler(MarketProfileReadinessException.class)
    public ResponseEntity<Body> handle(MarketProfileReadinessException exception) {
        return ResponseEntity.status(exception.pending() ? HttpStatus.CONFLICT : HttpStatus.SERVICE_UNAVAILABLE)
                .body(new Body(exception.code(), exception.stage(), exception.getMessage()));
    }
}
