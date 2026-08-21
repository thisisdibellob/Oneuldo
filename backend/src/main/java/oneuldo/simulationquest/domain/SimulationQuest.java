package oneuldo.simulationquest.domain;

import lombok.Getter;
import oneuldo.quest.domain.Quest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;
import java.util.List;
import java.util.UUID;

@Getter
public class SimulationQuest {

    private final UUID id;
    private final Quest quest;
    private final String placeId;
    private final Simulation simulation;
    private final List<Dialogue> dialogues;

    public SimulationQuest(
            UUID id,
            Quest quest,
            String placeId,
            Simulation simulation,
            List<Dialogue> dialogues
    ) {
        this.id = id;
        this.quest = quest;
        this.placeId = placeId;
        this.simulation = simulation;
        this.dialogues = List.copyOf(dialogues);
    }

}
