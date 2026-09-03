package oneuldo.behaviorlog.analysis.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputRequest;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/behavior-analysis-inputs")
@RequiredArgsConstructor
public class BehaviorAnalysisInputController {

    private final BehaviorAnalysisInputService inputService;

    @PostMapping
    public BehaviorAnalysisInputResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) BehaviorAnalysisInputRequest request
    ) {
        return inputService.create(memberId(jwt), request);
    }

    @GetMapping("/latest")
    public BehaviorAnalysisInputResponse latest(@AuthenticationPrincipal Jwt jwt) {
        return inputService.findLatest(memberId(jwt));
    }

    @GetMapping("/{datasetId}")
    public BehaviorAnalysisInputResponse find(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID datasetId
    ) {
        return inputService.find(memberId(jwt), datasetId);
    }

    private UUID memberId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
