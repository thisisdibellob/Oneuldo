package oneuldo.simulationquest.dto;

import oneuldo.quest.domain.Quest;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.simulationquest.domain.Simulation;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;

import java.util.List;
import java.util.UUID;

public record SimulationQuestResponse (
        UUID id,
        QuestSummaryResponse quest,
        String placeId,
        Simulation simulation,
        List<Dialogue>dialogues
) {

    public static SimulationQuestResponse from(SimulationQuest simulationQuest) {
        return new SimulationQuestResponse(
                simulationQuest.getId(),
                QuestSummaryResponse.from(simulationQuest.getQuest()),
                simulationQuest.getPlaceId(),
                simulationQuest.getSimulation(),
                simulationQuest.getDialogues()
        );
    }
}
