package oneuldo.auth.service;

import jakarta.servlet.http.HttpSession;
import oneuldo.auth.dto.LoginRequest;
import oneuldo.auth.dto.LoginResponse;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    public LoginResponse login(LoginRequest request, HttpSession session) {

    }

    public void logout(HttpSession session) {

    }
}
