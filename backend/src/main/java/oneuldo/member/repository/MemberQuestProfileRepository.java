package oneuldo.member.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.member.domain.MemberQuestProfile;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberQuestProfileRepository extends JpaRepository<MemberQuestProfile, UUID> {

    @EntityGraph(attributePaths = "preferredSubcategoryCodes")
    Optional<MemberQuestProfile> findByMemberId(UUID memberId);
}
