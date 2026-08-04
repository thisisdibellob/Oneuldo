package oneuldo.member.dto;

import java.time.LocalDate;

public class MemberSignUpRequest {

    String name;
    String email;
    String password;
    String passwordConfirm;
    LocalDate birthDate;
}
