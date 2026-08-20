package oneuldo.simulationquest;

import oneuldo.simulationquest.service.AlgorithmGenerator;
import oneuldo.simulationquest.service.SimulationQuestGenerator;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.place.repository.PlaceRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.simulationquest.repository.SimulationRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SimulationConfig {

    @Bean
    public SimulationQuestGenerator simulationQuestGenerator(
            QuestRepository questRepository,
            MemberQuestProfileRepository profileRepository,
            SimulationRepository simulationRepository,
            PlaceRepository placeRepository
    ) {
        return new AlgorithmGenerator(
                questRepository,
                profileRepository,
                simulationRepository,
                placeRepository
        );
    }
}
