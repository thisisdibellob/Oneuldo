package oneuldo.quest.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.DifficultyAdjustmentHistory;

public interface DifficultyAdjustmentHistoryRepository
        extends JpaRepository<DifficultyAdjustmentHistory, UUID> {
}
