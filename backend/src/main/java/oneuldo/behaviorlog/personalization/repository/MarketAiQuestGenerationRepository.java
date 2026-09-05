package oneuldo.behaviorlog.personalization.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketAiQuestGenerationRepository
        extends JpaRepository<MarketAiQuestGeneration, UUID> {
    List<MarketAiQuestGeneration> findAllByMemberIdOrderByCreatedAtDesc(UUID memberId);
    java.util.Optional<MarketAiQuestGeneration> findFirstByMemberIdAndRequestKeyAndSourceOrderByCreatedAtDesc(UUID memberId,String requestKey,String source);
}
