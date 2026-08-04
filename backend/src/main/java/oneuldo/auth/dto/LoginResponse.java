package oneuldo.auth.dto;

import oneuldo.member.domain.MemberRole;

public class LoginResponse {

    Long memberId;
    String name;
    String email;
    MemberRole role;

}
