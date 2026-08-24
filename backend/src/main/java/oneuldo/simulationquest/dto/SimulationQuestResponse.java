package oneuldo.simulationquest.dto;

import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.simulationquest.domain.Simulation;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;
import oneuldo.simulationquest.dto.payload.SimulationPayload;

import java.util.List;
import java.util.UUID;

public record SimulationQuestResponse (
        UUID id,
        QuestSummaryResponse quest,
        String placeId,
        Simulation simulation,
        SimulationPayload config,
        List<Dialogue>dialogues
) {

    public static SimulationQuestResponse from(SimulationQuest simulationQuest) {
        return from(simulationQuest, null);
    }

    public static SimulationQuestResponse from(
            SimulationQuest simulationQuest,
            SimulationPayload config
    ) {
        return new SimulationQuestResponse(
                simulationQuest.getId(),
                QuestSummaryResponse.from(simulationQuest.getQuest()),
                simulationQuest.getPlaceId(),
                simulationQuest.getSimulation(),
                config,
                simulationQuest.getDialogues()
        );
    }
}
