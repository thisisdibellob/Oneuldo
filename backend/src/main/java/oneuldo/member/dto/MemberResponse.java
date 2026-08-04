package oneuldo.member.dto;

import oneuldo.member.domain.MemberRole;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class MemberResponse {
    Long id;
    String name;
    String email;
    MemberRole role;
    LocalDate birthDate;
    LocalDateTime createdAt;
    LocalDateTime updatedAt;

}
