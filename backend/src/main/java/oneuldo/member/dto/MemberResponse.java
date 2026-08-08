package oneuldo.member.dto;

import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;

// UTC 기준 생성일·수정일을 응답에 사용합니다.
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record MemberResponse (
    UUID id,
    String name,
    String email,
    MemberRole role,
    LocalDate birthDate,
    Instant createdAt,
    Instant updatedAt
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
