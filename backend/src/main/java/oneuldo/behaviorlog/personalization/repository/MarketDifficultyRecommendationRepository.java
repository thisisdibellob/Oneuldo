package oneuldo.behaviorlog.personalization.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketDifficultyRecommendationRepository
        extends JpaRepository<MarketDifficultyRecommendation, UUID> {
    Optional<MarketDifficultyRecommendation> findFirstByMemberIdOrderByGeneratedAtDesc(UUID memberId);
    Optional<MarketDifficultyRecommendation> findByMemberIdAndProfileSnapshotId(
            UUID memberId, UUID profileSnapshotId);
}
