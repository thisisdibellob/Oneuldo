package oneuldo.behaviorlog.profile.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiUserProfileRepository extends JpaRepository<AiUserProfile, UUID> {
    Optional<AiUserProfile> findFirstByMemberIdOrderByCreatedAtDesc(UUID memberId);
    Optional<AiUserProfile> findFirstByMemberIdAndStatusOrderByCreatedAtDesc(UUID memberId, String status);
    Optional<AiUserProfile> findFirstByMemberIdAndSourceAnalysisIdAndStatusOrderByCreatedAtDesc(
            UUID memberId, UUID sourceAnalysisId, String status);
    Optional<AiUserProfile> findByIdAndMemberIdAndStatus(UUID id, UUID memberId, String status);
    Optional<AiUserProfile> findFirstByMemberIdAndSourceSessionIdOrderByCreatedAtDesc(UUID memberId, UUID sourceSessionId);
}
