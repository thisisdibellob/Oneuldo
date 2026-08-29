package oneuldo.behaviorlog.normalization.controller;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationAttemptService;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationMonitoringService;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationProcessor;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationSummary;
import oneuldo.behaviorlog.normalization.service.QuarantinedNormalizationData;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/behavior-normalization")
@RequiredArgsConstructor
public class BehaviorNormalizationAdminController {

    private final BehaviorNormalizationMonitoringService monitoringService;
    private final BehaviorNormalizationAttemptService attemptService;
    private final BehaviorNormalizationProcessor normalizationProcessor;

    @GetMapping("/summary")
    public BehaviorNormalizationSummary summary(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return monitoringService.getSummary();
    }

    @GetMapping("/quarantined")
    public List<QuarantinedNormalizationData> quarantined(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "50") int limit
    ) {
        requireAdmin(jwt);
        return monitoringService.getQuarantined(limit);
    }

    @PostMapping("/dead-letters/{behaviorLogId}/retry")
    public RetryResponse retryDeadLetter(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID behaviorLogId
    ) {
        requireAdmin(jwt);
        attemptService.requestManualRetry(behaviorLogId);
        return new RetryResponse(behaviorLogId, normalizationProcessor.process(behaviorLogId));
    }

    private void requireAdmin(Jwt jwt) {
        if (!"ADMIN".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자 권한이 필요합니다.");
        }
    }

    public record RetryResponse(UUID behaviorLogId, boolean completed) {
    }
}
