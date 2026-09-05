package oneuldo.behaviorlog.analysis.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/behavior-analyses")
@RequiredArgsConstructor
public class AiBehaviorAnalysisController {
    private final AiBehaviorAnalysisService service;
    private final oneuldo.behaviorlog.repository.BehaviorLogRepository logs;

    @PostMapping("/sessions/{sessionId}")
    public AiBehaviorAnalysisResponse analyzeSession(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        return service.analyzeSession(UUID.fromString(jwt.getSubject()), sessionId);
    }
    @GetMapping("/sessions/{sessionId}/receipt")
    public java.util.Map<String, Object> receipt(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        return java.util.Map.of("sequences", logs.findEventSequencesByMemberIdAndSessionId(UUID.fromString(jwt.getSubject()), sessionId));
    }
    @GetMapping("/sessions/{sessionId}/scene")
    public Object scene(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        return logs.findAllByMemberIdAndSessionIdOrderByEventSequence(UUID.fromString(jwt.getSubject()), sessionId).stream()
            .map(log -> log.getPayload())
            .filter(payload -> payload instanceof oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload)
            .map(payload -> ((oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload) payload).marketContent())
            .filter(content -> content != null && content.containsKey("sceneSnapshot"))
            .map(content -> content.get("sceneSnapshot")).filter(java.util.Objects::nonNull).findFirst()
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
    }
    @PostMapping
    public AiBehaviorAnalysisResponse analyze(@AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) BehaviorAnalysisInputRequest request) {
        return service.analyze(UUID.fromString(jwt.getSubject()), request);
    }
    @GetMapping("/latest")
    public ResponseEntity<AiBehaviorAnalysisResponse> latest(@AuthenticationPrincipal Jwt jwt) {
        var result = service.latest(UUID.fromString(jwt.getSubject()));
        return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
    }
    @GetMapping("/{id}")
    public AiBehaviorAnalysisResponse find(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.find(UUID.fromString(jwt.getSubject()), id);
    }
}
