package oneuldo.member.domain;
// 모든 Entity가 공통으로 사용하는 생성일·수정일 기능을 가져옵니다.
import oneuldo.global.entity.BaseTimeEntity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String loginId;

    private String password;
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Enumerated(EnumType.STRING)
    private MemberRole role;

    private LocalDate birthDate;

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
    }
}
