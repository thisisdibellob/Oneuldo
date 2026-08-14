package oneuldo.simulationquest.service;

import lombok.RequiredArgsConstructor;
import oneuldo.global.exception.MemberNotFoundException;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import oneuldo.quest.service.QuestService;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.dto.SimulationQuestResponse;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SimulationQuestService {

    private final MemberRepository memberRepository;
    private final SimulationQuestGenerator generator;

    public SimulationQuestResponse getSimulationQuest(UUID id) {

        Member member = memberRepository.findById(id)
                .orElseThrow(MemberNotFoundException::new);

        SimulationQuest simulationQuest = generator.create(member);
        return SimulationQuestResponse.from(simulationQuest);
    }
}
