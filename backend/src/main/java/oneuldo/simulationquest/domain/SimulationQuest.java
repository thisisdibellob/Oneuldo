package oneuldo.simulationquest.domain;

import lombok.Data;
import oneuldo.quest.domain.Quest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;
import java.util.List;
import java.util.UUID;

@Data
public class SimulationQuest {

    private final UUID id;
    private final Quest quest;
    private final String placeId;
    private final Simulation simulation;
    private List<Dialogue> dialogues;

}
