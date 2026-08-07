package oneuldo.member.dto;

import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public record MemberResponse (
    UUID id,
    String name,
    String email,
    MemberRole role,
    LocalDate birthDate,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {

    public static MemberResponse from(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getName(),
                member.getEmail(),
                member.getRole(),
                member.getBirthDate(),
                member.getCreatedAt(),
                member.getUpdatedAt()
        );
    }
}
