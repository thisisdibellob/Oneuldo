package oneuldo.quest.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
import oneuldo.quest.repository.QuestSessionRepository;

// 퀘스트 조회 기능을 처리하는 Service
@Service
@RequiredArgsConstructor
public class QuestService {

    private final QuestRepository questRepository;
    private final QuestStepRepository questStepRepository;
    private final QuestChoiceRepository questChoiceRepository;
    private final DifficultyAdjustmentService difficultyAdjustmentService;
    private final QuestSessionRepository questSessionRepository;

    // 활성화된 퀘스트 목록을 조회함
    @Transactional(readOnly = true)
    public List<QuestSummaryResponse> findActiveQuests() {

        // 로그인 전에도 같은 세부 분야의 견본 여러 개를 카드 여러 개로 노출하지 않는다.
        return groupBySubcategory(questRepository.findAllActiveWithCategory())
                .values()
                .stream()
                .map(quests -> selectScenario(quests, oneuldo.quest.domain.QuestDifficulty.EASY, 0))
                .map(QuestSummaryResponse::from)
                .toList();
    }

    // 로그인 사용자의 세부 분야 난이도와 가까운 퀘스트를 앞에 배치한다.
    @Transactional(readOnly = true)
    public List<QuestSummaryResponse> findRecommendedQuests(UUID memberId) {
        Map<UUID, oneuldo.quest.domain.QuestDifficulty> difficulties =
                difficultyAdjustmentService.findCurrentDifficulties(memberId);

        return groupBySubcategory(questRepository.findAllActiveWithCategory())
                .values()
                .stream()
                .map(quests -> {
                    UUID subcategoryId = quests.getFirst().getSubcategory().getId();
                    var target = difficulties.getOrDefault(
                            subcategoryId,
                            oneuldo.quest.domain.QuestDifficulty.EASY
                    );
                    // 시작된 세션 수를 이용해 같은 난이도의 견본을 차례로 순환한다.
                    long playedCount = questSessionRepository
                            .countByMemberIdAndQuestSubcategoryId(memberId, subcategoryId);
                    return selectScenario(quests, target, playedCount);
                })
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

    private int difficultyRank(oneuldo.quest.domain.QuestDifficulty difficulty) {
        return switch (difficulty) {
            case VERY_EASY -> 0;
            case EASY -> 1;
            case NORMAL -> 2;
            case HARD -> 3;
            case VERY_HARD -> 4;
        };
    }

    private Map<UUID, List<Quest>> groupBySubcategory(List<Quest> quests) {
        return quests.stream().collect(Collectors.groupingBy(
                quest -> quest.getSubcategory().getId(),
                LinkedHashMap::new,
                Collectors.toList()
        ));
    }

    private Quest selectScenario(
            List<Quest> quests,
            oneuldo.quest.domain.QuestDifficulty target,
            long playedCount
    ) {
        List<Quest> exact = quests.stream()
                .filter(quest -> quest.getDifficulty() == target)
                .sorted(Comparator.comparing(Quest::getCode))
                .toList();
        List<Quest> candidates = exact.isEmpty()
                ? quests.stream()
                    .sorted(Comparator.comparingInt(quest ->
                            Math.abs(difficultyRank(quest.getDifficulty()) - difficultyRank(target))))
                    .toList()
                : exact;
        return candidates.get(Math.floorMod(playedCount, candidates.size()));
    }
}
