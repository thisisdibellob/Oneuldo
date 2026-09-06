package oneuldo.behaviorlog.profile.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisService;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/user-profiles")
@RequiredArgsConstructor
public class AiUserProfileController {
    private final AiUserProfileService service;
    private final AiBehaviorAnalysisService analyses;
    private final BehaviorLogRepository logs;

    @GetMapping("/current")
    public ResponseEntity<AiUserProfileResponse> current(@AuthenticationPrincipal Jwt jwt) {
        return service.current(UUID.fromString(jwt.getSubject()))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** 현재 프로필에 아직 반영되지 않은 가장 최근 완료 세션 하나만 분석해 병합한다. */
    @PostMapping("/current/refresh")
    public ResponseEntity<AiUserProfileResponse> refresh(@AuthenticationPrincipal Jwt jwt) {
        UUID memberId = UUID.fromString(jwt.getSubject());
        var latestSessions = logs.findLatestCompletedSessionIds(memberId, PageRequest.of(0, 1));
        if (latestSessions.isEmpty()) {
            return service.current(memberId).map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.noContent().build());
        }

        UUID latestSessionId = latestSessions.getFirst();
        var current = service.current(memberId).orElse(null);
        if (current != null && latestSessionId.equals(current.sourceSessionId())) {
            return ResponseEntity.ok(current);
        }

        var analysis = analyses.analyzeSession(memberId, latestSessionId);
        if (!"READY".equals(analysis.status())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "최신 플레이 분석을 완료하지 못했습니다: " + analysis.errorCode());
        }
        var refreshed = service.current(memberId).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "최신 플레이를 프로필에 반영하지 못했습니다."));
        if (!latestSessionId.equals(refreshed.sourceSessionId())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "최신 플레이를 프로필에 반영하지 못했습니다.");
        }
        return ResponseEntity.ok(refreshed);
    }
}
