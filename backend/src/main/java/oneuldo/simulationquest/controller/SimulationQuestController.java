package oneuldo.simulationquest.controller;

import lombok.RequiredArgsConstructor;
import oneuldo.simulationquest.dto.SimulationQuestResponse;
import oneuldo.simulationquest.service.SimulationQuestService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/simulation-quest")
@RequiredArgsConstructor
public class SimulationQuestController {

    private final SimulationQuestService simulationQuestService;

    @GetMapping
    public SimulationQuestResponse getSimulationQuest(@AuthenticationPrincipal Jwt jwt) {
        UUID memberId = UUID.fromString(jwt.getSubject());
        return simulationQuestService.getSimulationQuest(memberId);
    }

}
