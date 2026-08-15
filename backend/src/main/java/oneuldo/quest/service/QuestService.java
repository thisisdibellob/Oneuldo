package oneuldo.quest.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.dto.QuestChoiceResponse;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestStepResponse;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.quest.repository.QuestChoiceRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestStepRepository;

// 퀘스트 조회 기능을 처리하는 Service
@Service
@RequiredArgsConstructor
public class QuestService {

    private final QuestRepository questRepository;
    private final QuestStepRepository questStepRepository;
    private final QuestChoiceRepository questChoiceRepository;

    // 활성화된 퀘스트 목록을 조회함
    @Transactional(readOnly = true)
    public List<QuestSummaryResponse> findActiveQuests() {

        return questRepository.findAllActiveWithCategory()
                .stream()
                .map(QuestSummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public QuestSummaryResponse findQuest(UUID uuid) {
        return QuestSummaryResponse.from(findQuestOrThrow(uuid));
    }

    // 퀘스트 기본 정보와 단계, 선택지를 순서대로 조립한다.
    @Transactional(readOnly = true)
    public QuestDetailResponse findQuestDetail(UUID uuid) {
        Quest quest = findQuestOrThrow(uuid);

        var questSteps = questStepRepository.findAllByQuestIdOrderByStepOrderAsc(uuid);
        var stepIds = questSteps.stream().map(step -> step.getId()).toList();
        Map<UUID, List<QuestChoiceResponse>> choicesByStep = questChoiceRepository
                .findAllByStepIdInOrderByChoiceOrderAsc(stepIds)
                .stream()
                .collect(Collectors.groupingBy(
                        choice -> choice.getStep().getId(),
                        Collectors.mapping(QuestChoiceResponse::from, Collectors.toList())
                ));

        List<QuestStepResponse> steps = questSteps.stream()
                .map(step -> QuestStepResponse.from(
                        step,
                        choicesByStep.getOrDefault(step.getId(), List.of())
                ))
                .toList();

        return QuestDetailResponse.from(quest, steps);
    }

    // 존재하지 않는 퀘스트의 공통 404 처리를 담당한다.
    private Quest findQuestOrThrow(UUID uuid) {
        return questRepository.findById(uuid)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "퀘스트를 찾을 수 없습니다."
                ));
    }
}
