package oneuldo.auth.token;

import oneuldo.member.domain.Member;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final JwtEncoder jwtEncoder;
    private final JwtDecoder refreshJwtDecoder;
    private final String issuer;
    private final Duration accessExpiration;
    private final Duration refreshExpiration;

    public JwtTokenProvider(
            JwtEncoder jwtEncoder,
            @Qualifier("refreshJwtDecoder")
            JwtDecoder refreshJwtDecoder,
            @Value("${security.jwt.issuer}")
            String issuer,
            @Value("${security.jwt.access-expiration}")
            Duration accessExpiration,
            @Value("${security.jwt.refresh-expiration}")
            Duration refreshExpiration
    ) {
        this.jwtEncoder = jwtEncoder;
        this.refreshJwtDecoder = refreshJwtDecoder;
        this.issuer = issuer;
        this.accessExpiration = accessExpiration;
        this.refreshExpiration = refreshExpiration;
    }

    public String createAccessToken(Member member) {
        return createToken(
                member,
                accessExpiration,
                "access",
                true
        );
    }

    public String createRefreshToken(Member member) {
        return createToken(
                member,
                refreshExpiration,
                "refresh",
                false
        );
    }

    public long getAccessTokenExpiresIn() {
        return accessExpiration.toSeconds();
    }

    public Instant getExpiration(String token) {
        return refreshJwtDecoder.decode(token).getExpiresAt();
    }

    private String createToken(
            Member member,
            Duration expiration,
            String tokenType,
            boolean includeRole
    ) {
        Instant now = Instant.now();

        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(member.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(expiration))
                .id(UUID.randomUUID().toString())
                .claim("token_type", tokenType);

        if (includeRole) {
            claims.claim(
                    "role",
                    member.getRole().name()
            );
        }

        return jwtEncoder.encode(
                JwtEncoderParameters.from(claims.build())
        ).getTokenValue();
    }

    public Jwt decode(String token) {
        return refreshJwtDecoder.decode(token);
    }
}
