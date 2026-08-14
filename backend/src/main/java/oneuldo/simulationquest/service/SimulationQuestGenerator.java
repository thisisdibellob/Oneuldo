package oneuldo.simulationquest.service;

import oneuldo.member.domain.Member;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.dto.SimulationQuestResponse;

public interface SimulationQuestGenerator {

    SimulationQuest create(Member member);
}
