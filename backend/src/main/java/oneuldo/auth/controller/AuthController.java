package oneuldo.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import oneuldo.auth.dto.*;
import oneuldo.auth.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody LogoutRequest request) {

        UUID memberId = UUID.fromString(jwt.getSubject());
        authService.logout(memberId, request);
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(
            @Valid @RequestBody TokenRefreshRequest request
    ) {
        return authService.refresh(request);
    }



}
