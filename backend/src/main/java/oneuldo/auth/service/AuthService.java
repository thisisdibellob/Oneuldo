package oneuldo.auth.service;

import lombok.RequiredArgsConstructor;
import oneuldo.auth.dto.*;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.global.exception.InvalidCredentialsException;
import oneuldo.global.exception.InvalidTokenException;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenService refreshTokenService;

    @Transactional
    public LoginResponse login(LoginRequest request) {

        // 이메일 검증
        String email = request.getEmail()
                .trim()
                .toLowerCase(Locale.ROOT);

        Member member = memberRepository.findByEmail(email)
                .orElseThrow(InvalidCredentialsException::new);

        // 비밀번호 검증
        if (!passwordEncoder.matches(
                request.getPassword(),
                member.getPassword()
        )) {
            throw new InvalidCredentialsException();
        }

        // 토큰 생성
        String accessToken = jwtTokenProvider.createAccessToken(member);
        String refreshToken = jwtTokenProvider.createRefreshToken(member);

        // 토큰 저장
        refreshTokenService.save(member.getId(), refreshToken);

        // 반환
        return new LoginResponse(
                accessToken,
                refreshToken,
                "Bearer",
                jwtTokenProvider.getAccessTokenExpiresIn(),
                member.getId(),
                member.getName(),
                member.getEmail(),
                member.getRole()
        );
    }

    public void logout(UUID memberId, LogoutRequest request) {
        refreshTokenService.revoke(memberId, request.getRefreshToken());
    }

    @Transactional
    public TokenResponse refresh(
            TokenRefreshRequest request
    ) {
        String oldRefreshToken = request.getRefreshToken();

        UUID memberId =
                refreshTokenService.validateAndGetMemberId(
                        oldRefreshToken
                );

        Member member = memberRepository.findById(memberId)
                .orElseThrow(InvalidTokenException::new);

        String newAccessToken =
                jwtTokenProvider.createAccessToken(member);

        String newRefreshToken =
                jwtTokenProvider.createRefreshToken(member);

        refreshTokenService.save(
                memberId,
                newRefreshToken
        );

        return new TokenResponse(
                newAccessToken,
                newRefreshToken,
                "Bearer",
                jwtTokenProvider.getAccessTokenExpiresIn()
        );
    }
}
