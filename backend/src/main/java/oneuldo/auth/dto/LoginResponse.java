package oneuldo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import oneuldo.member.domain.MemberRole;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class LoginResponse {

    String accessToken;
    String refreshToken;
    String tokenType;
    long expiresIn;
    UUID memberId;
    String name;
    String email;
    MemberRole role;

}
