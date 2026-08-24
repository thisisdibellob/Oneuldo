package oneuldo.simulationquest.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.simulationquest.domain.SimulationQuest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimulationQuestRepository extends JpaRepository<SimulationQuest, UUID> {
    List<SimulationQuest> findAllByQuestIdAndActiveTrueOrderByTitle(UUID questId);
}
