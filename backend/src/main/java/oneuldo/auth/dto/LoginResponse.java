package oneuldo.auth.dto;

import oneuldo.member.domain.MemberRole;
import java.util.UUID;

public record LoginResponse (
    String accessToken,
    String refreshToken,
    String tokenType,
    long expiresIn,
    UUID memberId,
    String name,
    String email,
    MemberRole role
) {
}
