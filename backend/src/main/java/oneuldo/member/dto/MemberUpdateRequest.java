package oneuldo.member.dto;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;

import java.time.LocalDate;

@Getter
public class MemberUpdateRequest {

    @Pattern(regexp = ".*\\S.*", message = "{member.name.notBlank}")
    String name;

    @Past(message = "{member.birthDate.past}")
    LocalDate birthDate;
}
