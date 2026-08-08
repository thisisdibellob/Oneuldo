package oneuldo.member.dto;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

public record MemberUpdateRequest (

    @Pattern(regexp = ".*\\S.*", message = "{member.name.notBlank}")
    String name,

    @Past(message = "{member.birthDate.past}")
    LocalDate birthDate
) {
}
