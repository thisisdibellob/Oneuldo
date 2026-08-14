package oneuldo.simulationquest;

import oneuldo.simulationquest.service.AlgorithmGenerator;
import oneuldo.simulationquest.service.SimulationQuestGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@Configuration
public class SimulationConfig {

    @Bean
    public SimulationQuestGenerator simulationQuestGenerator() {
        return new AlgorithmGenerator();
    }
}
