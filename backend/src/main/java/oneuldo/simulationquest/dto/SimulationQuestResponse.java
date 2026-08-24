package oneuldo.simulationquest.dto;

import java.util.List;
import java.util.UUID;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;

public record SimulationQuestResponse(
        UUID id,
        QuestSummaryResponse quest,
        String placeId,
        String title,
        String description,
        SimulationType type,
        SimulationPayload config,
        boolean active,
        List<Dialogue> dialogues
) {

    public static SimulationQuestResponse from(SimulationQuest simulationQuest) {
        return new SimulationQuestResponse(
                simulationQuest.getId(),
                QuestSummaryResponse.from(simulationQuest.getQuest()),
                simulationQuest.getPlace().getCode(),
                simulationQuest.getTitle(),
                simulationQuest.getDescription(),
                simulationQuest.getType(),
                simulationQuest.getPayload(),
                simulationQuest.isActive(),
                simulationQuest.getDialogues()
        );
    }
}
