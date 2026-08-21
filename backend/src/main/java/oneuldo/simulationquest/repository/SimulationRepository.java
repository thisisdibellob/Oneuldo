package oneuldo.simulationquest.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.simulationquest.domain.Simulation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimulationRepository extends JpaRepository<Simulation, UUID> {
    List<Simulation> findAllByQuestIdAndActiveTrueOrderByTitle(UUID questId);
}
