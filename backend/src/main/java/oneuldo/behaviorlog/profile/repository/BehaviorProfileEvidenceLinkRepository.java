package oneuldo.behaviorlog.profile.repository;

import java.util.UUID;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileEvidenceLink;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorProfileEvidenceLinkRepository
        extends JpaRepository<BehaviorProfileEvidenceLink, UUID> {
}
