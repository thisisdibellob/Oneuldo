package oneuldo.simulationquest;

import oneuldo.simulationquest.service.AlgorithmGenerator;
import oneuldo.simulationquest.service.SimulationQuestGenerator;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.place.repository.PlaceRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.simulationquest.repository.SimulationQuestRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SimulationConfig {

    @Bean
    public SimulationQuestGenerator simulationQuestGenerator(
            QuestRepository questRepository,
            MemberQuestProfileRepository profileRepository,
            SimulationQuestRepository simulationQuestRepository,
            PlaceRepository placeRepository
    ) {
        return new AlgorithmGenerator(
                questRepository,
                profileRepository,
                simulationQuestRepository,
                placeRepository
        );
    }
}
