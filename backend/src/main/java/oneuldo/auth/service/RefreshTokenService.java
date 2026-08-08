package oneuldo.auth.service;
import lombok.RequiredArgsConstructor;
import oneuldo.auth.refresh.RefreshToken;
import oneuldo.auth.refresh.RefreshTokenRepository;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.global.exception.InvalidTokenException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;

    @Transactional
    public void save(
            UUID memberId,
            String rawRefreshToken
    ) {
        String tokenHash = hash(rawRefreshToken);

        Instant expiresAt =
                jwtTokenProvider.getExpiration(rawRefreshToken);

        RefreshToken refreshToken =
                refreshTokenRepository.findById(memberId)
                        .orElseGet(() ->
                                new RefreshToken(
                                        memberId,
                                        tokenHash,
                                        expiresAt
                                )
                        );

        refreshToken.rotate(tokenHash, expiresAt);

        refreshTokenRepository.save(refreshToken);
    }

    @Transactional
    public void delete(UUID memberId) {
        refreshTokenRepository.deleteById(memberId);
    }

    private String hash(String token) {
        try {
            MessageDigest digest =
                    MessageDigest.getInstance("SHA-256");

            byte[] result = digest.digest(
                    token.getBytes(StandardCharsets.UTF_8)
            );

            return HexFormat.of().formatHex(result);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private boolean matches(
            String rawToken,
            String savedTokenHash
    ) {
        String requestedTokenHash = hash(rawToken);

        return MessageDigest.isEqual(
                savedTokenHash.getBytes(StandardCharsets.UTF_8),
                requestedTokenHash.getBytes(StandardCharsets.UTF_8)
        );
    }

    @Transactional(readOnly = true)
    public UUID validateAndGetMemberId(String rawRefreshToken) {
        Jwt jwt = jwtTokenProvider.decode(rawRefreshToken);

        String tokenType = jwt.getClaimAsString("token_type");

        if (!"refresh".equals(tokenType)) {
            throw new InvalidTokenException();
        }

        UUID memberId;

        try {
            memberId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new InvalidTokenException();
        }

        RefreshToken savedToken = refreshTokenRepository.findById(memberId)
                        .orElseThrow(InvalidTokenException::new);

        if (savedToken.getExpiresAt().isBefore(Instant.now())) {
            throw new InvalidTokenException();
        }

        if (!matches(rawRefreshToken, savedToken.getTokenHash())) {
            throw new InvalidTokenException();
        }

        return memberId;
    }

    @Transactional
    public void revoke(
            UUID authenticatedMemberId,
            String rawRefreshToken
    ) {
        UUID tokenMemberId =
                validateAndGetMemberId(rawRefreshToken);

        if (!authenticatedMemberId.equals(tokenMemberId)) {
            throw new InvalidTokenException();
        }

        refreshTokenRepository.deleteById(tokenMemberId);
    }


}
