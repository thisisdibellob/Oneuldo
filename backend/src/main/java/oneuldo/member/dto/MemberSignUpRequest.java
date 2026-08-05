package oneuldo.member.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import lombok.Getter;

import java.time.LocalDate;

@Getter
public class MemberSignUpRequest {

    @NotBlank(message = "{member.loginId.required}")
    String LoginId;

    @NotBlank(message = "{member.name.required}")
    String name;

    @NotBlank(message = "{member.email.required}")
    @Email(message = "{member.email.invalid}")
    String email;

    @NotBlank(message = "{member.password.required}")
    @Size(min = 8, message = "{member.password.size}")
    String password;

    @NotBlank(message = "{member.passwordConfirm.required}")
    String passwordConfirm;

    @NotNull(message = "{member.birthDate.required}")
    @Past(message = "{member.birthDate.past}")
    LocalDate birthDate;




}
