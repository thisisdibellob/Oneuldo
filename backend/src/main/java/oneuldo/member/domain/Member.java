package oneuldo.member.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String loginId;
    private String password;
    private String name;
    private String email;

    @Enumerated(EnumType.STRING)
    private MemberRole role;

    private LocalDate birthDate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Member(
            String loginId,
            String password,
            String name,
            String email,
            MemberRole role,
            LocalDate birthDate) {
        this.loginId = loginId;
        this.password = password;
        this.name = name;
        this.email = email;
        this.role = role;
        this.birthDate = birthDate;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void updateProfile(
            String name,
            LocalDate birthDate
    ) {
        if (name != null) {
            this.name = name;
        }

        if (birthDate != null) {
            this.birthDate = birthDate;
        }

        this.updatedAt = LocalDateTime.now();
    }
}
