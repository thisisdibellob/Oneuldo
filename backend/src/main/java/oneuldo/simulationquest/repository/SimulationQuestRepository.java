package oneuldo.simulationquest.repository;

import java.util.List;
import java.util.UUID;
import oneuldo.simulationquest.domain.SimulationQuest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface SimulationQuestRepository extends JpaRepository<SimulationQuest, UUID> {
    List<SimulationQuest> findAllByQuestIdAndActiveTrueOrderByTitle(UUID questId);

    @Query("""
            select distinct simulation
            from SimulationQuest simulation
            join fetch simulation.quest quest
            join fetch quest.subcategory subcategory
            join fetch subcategory.category
            join fetch simulation.place place
            left join fetch quest.requiredSkillCodes
            where simulation.id = :simulationId
              and simulation.active = true
              and quest.active = true
              and place.active = true
            """)
    Optional<SimulationQuest> findActiveInputTemplateById(
            @Param("simulationId") UUID simulationId);
}
