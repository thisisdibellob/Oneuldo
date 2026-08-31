package oneuldo.behaviorlog.profile.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileGenerateRequest;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileResponse;
import oneuldo.behaviorlog.profile.service.BehaviorProfileService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/behavior-profiles")
@RequiredArgsConstructor
public class BehaviorProfileController {

    private final BehaviorProfileService behaviorProfileService;

    @GetMapping("/latest")
    public ResponseEntity<BehaviorProfileResponse> latest(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return behaviorProfileService.latest(memberId(jwt))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping
    public BehaviorProfileResponse generate(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) BehaviorProfileGenerateRequest request
    ) {
        return behaviorProfileService.generate(memberId(jwt), request);
    }

    private UUID memberId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
