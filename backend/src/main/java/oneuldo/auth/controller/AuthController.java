package oneuldo.auth.controller;

import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import oneuldo.auth.dto.LoginRequest;
import oneuldo.auth.dto.LoginResponse;
import oneuldo.auth.dto.LogoutRequest;
import oneuldo.auth.service.AuthService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request,
                               HttpSession session) {
        return authService.login(request, session);
    }

    @PostMapping("/logout")
    public void logout(@RequestBody LogoutRequest request,
                       HttpSession session) {
        authService.logout(session);
    }



}
