package oneuldo.behaviorlog.analysis.repository;

import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputEventLink;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BehaviorAnalysisInputEventLinkRepository
        extends JpaRepository<BehaviorAnalysisInputEventLink, UUID> {
}
