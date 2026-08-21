package oneuldo.global.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleValidation(MethodArgumentNotValidException exception) {

        return exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        error -> error.getDefaultMessage(),
                        (first, second) -> first
                ));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(
                        "DUPLICATE_MEMBER",
                        "이미 사용 중인 이메일 또는 아이디입니다."
                ));
    }

    @ExceptionHandler(DuplicateMemberException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateMember(
            DuplicateMemberException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(
                        "DUPLICATE_MEMBER",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(MemberNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleMemberNotFound(
            MemberNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(
                        "MEMBER_NOT_FOUND",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(ActiveQuestNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleActiveQuestNotFound(
            ActiveQuestNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(
                        "ACTIVE_QUEST_NOT_FOUND",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(SimulationNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleSimulationNotFound(
            SimulationNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(
                        "SIMULATION_NOT_FOUND",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(PlaceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handlePlaceNotFound(
            PlaceNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(
                        "PLACE_NOT_FOUND",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(DailyQuestLimitExceededException.class)
    public ResponseEntity<ErrorResponse> handleDailyQuestLimitExceeded(
            DailyQuestLimitExceededException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new ErrorResponse(
                        "DAILY_QUEST_LIMIT_EXCEEDED",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCredentials(
            InvalidCredentialsException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse(
                        "INVALID_CREDENTIALS",
                        exception.getMessage()
                ));
    }

    @ExceptionHandler({InvalidTokenException.class, JwtException.class})
    public ResponseEntity<ErrorResponse> handleInvalidToken(
            RuntimeException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse(
                        "INVALID_TOKEN",
                        "유효하지 않은 토큰입니다."
                ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException exception
    ) {
        return ResponseEntity
                .badRequest()
                .body(new ErrorResponse(
                        "INVALID_REQUEST",
                        exception.getMessage()
                ));
    }
}
