package oneuldo.member.repository;

import oneuldo.member.domain.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MemberRepository extends JpaRepository<Member, UUID> {

    boolean existsByEmail(String email);

    boolean existsByLoginId(String loginId);

    Optional<Member> findByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select member from Member member where member.id = :id")
    Optional<Member> findByIdForUpdate(@Param("id") UUID id);




}
