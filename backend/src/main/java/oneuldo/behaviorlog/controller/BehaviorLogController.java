package oneuldo.behaviorlog.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLogBatchRequest;
import oneuldo.behaviorlog.domain.BehaviorLogBatchResponse;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.BehaviorLogResponse;
import oneuldo.behaviorlog.service.BehaviorLogService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/behavior-logs")
@RequiredArgsConstructor
public class BehaviorLogController {

    private final BehaviorLogService behaviorLogService;

    @PostMapping
    public BehaviorLogResponse record(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody BehaviorLogRequest request
    ) {
        return behaviorLogService.record(memberId(jwt), request);
    }

    @PostMapping("/batches")
    public BehaviorLogBatchResponse recordBatch(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody BehaviorLogBatchRequest request
    ) {
        return behaviorLogService.recordBatch(memberId(jwt), request);
    }

    private UUID memberId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
