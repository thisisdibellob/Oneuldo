package oneuldo.quest.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestCategory;
import oneuldo.quest.domain.QuestChoice;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestStep;
import oneuldo.quest.domain.QuestSubcategory;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.quest.repository.QuestCategoryRepository;
import oneuldo.quest.repository.QuestChoiceRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestStepRepository;
import oneuldo.quest.repository.QuestSubcategoryRepository;

// 실제 Spring 환경과 테스트용 H2 DB를 실행함
@SpringBootTest
// 테스트가 끝나면 저장한 데이터를 되돌림
@Transactional
class QuestServiceTest {

    private final QuestCategoryRepository categoryRepository;
    private final QuestSubcategoryRepository subcategoryRepository;
    private final QuestRepository questRepository;
    private final QuestStepRepository stepRepository;
    private final QuestChoiceRepository choiceRepository;
    private final QuestService questService;

    // 테스트에 필요한 Repository와 Service를 주입함
    @Autowired
    QuestServiceTest(
            QuestCategoryRepository categoryRepository,
            QuestSubcategoryRepository subcategoryRepository,
            QuestRepository questRepository,
            QuestStepRepository stepRepository,
            QuestChoiceRepository choiceRepository,
            QuestService questService
    ) {
        this.categoryRepository = categoryRepository;
        this.subcategoryRepository = subcategoryRepository;
        this.questRepository = questRepository;
        this.stepRepository = stepRepository;
        this.choiceRepository = choiceRepository;
        this.questService = questService;
    }

    @Test
    void 활성화된_퀘스트만_조회할_수_있다() {

        // 상위 카테고리 저장
        QuestCategory category = categoryRepository.save(
                new QuestCategory(
                        "LIFE",
                        "생활",
                        1,
                        true
                )
        );

        // 세부 카테고리 저장
        QuestSubcategory subcategory = subcategoryRepository.save(
                new QuestSubcategory(
                        category,
                        "PUBLIC_TRANSPORT",
                        "대중교통",
                        QuestDifficulty.VERY_EASY,
                        QuestDifficulty.VERY_HARD,
                        1,
                        true
                )
        );

        // 활성 퀘스트 저장
        questRepository.save(
                new Quest(
                        subcategory,
                        "TAKE_BUS_ALONE",
                        "혼자 버스 타기",
                        "목적지까지 가는 버스를 찾아봐요.",
                        "혼자 버스를 이용할 수 있다.",
                        QuestDifficulty.EASY,
                        20,
                        true
                )
        );

        // 같은 세부 분야의 다른 원본 견본은 별도 카드로 늘어나지 않아야 한다.
        questRepository.save(
                new Quest(
                        subcategory,
                        "Z_SECOND_BUS_SCENARIO",
                        "두 번째 버스 견본",
                        "같은 대중교통 트랙 안에서 순환합니다.",
                        "같은 난이도의 다른 상황을 연습한다.",
                        QuestDifficulty.EASY,
                        20,
                        true
                )
        );

        // 비활성 퀘스트 저장
        questRepository.save(
                new Quest(
                        subcategory,
                        "HIDDEN_QUEST",
                        "숨겨진 퀘스트",
                        "화면에 표시되지 않아야 합니다.",
                        "활성 상태에 따른 조회를 확인한다.",
                        QuestDifficulty.EASY,
                        10,
                        false
                )
        );

        // 서비스에서 활성 퀘스트 목록 조회
        List<QuestSummaryResponse> responses =
                questService.findActiveQuests();

        // 활성 원본이 여러 개여도 세부 분야 카드 한 개만 조회되는지 확인
        assertEquals(1, responses.size());

        QuestSummaryResponse response = responses.getFirst();

        // DTO 내용이 맞는지 확인
        assertEquals("PUBLIC_TRANSPORT", response.categoryCode());
        assertEquals("대중교통", response.categoryName());
        assertEquals("혼자 버스 타기", response.title());
        assertEquals("EASY", response.difficulty());
        assertEquals(20, response.rewardPoints());
    }

    @Test
    void 퀘스트_상세는_단계와_선택지를_정해진_순서로_반환한다() {
        QuestCategory category = categoryRepository.save(
                new QuestCategory("LIFE", "생활", 1, true)
        );
        QuestSubcategory subcategory = subcategoryRepository.save(new QuestSubcategory(
                category,
                "PUBLIC_TRANSPORT",
                "대중교통",
                QuestDifficulty.VERY_EASY,
                QuestDifficulty.VERY_HARD,
                1,
                true
        ));
        Quest quest = questRepository.save(new Quest(
                subcategory,
                "TAKE_BUS_ALONE",
                "혼자 버스 타기",
                "버스를 이용해요.",
                "버스 번호를 확인한다.",
                QuestDifficulty.EASY,
                20,
                true
        ));

        QuestStep second = stepRepository.save(new QuestStep(
                quest, 2, "두 번째 단계", "두 번째 상황", null
        ));
        QuestStep first = stepRepository.save(new QuestStep(
                quest, 1, "첫 번째 단계", "첫 번째 상황", "첫 번째 힌트"
        ));
        choiceRepository.save(new QuestChoice(first, 2, "두 번째 선택", false, "다시 확인해요."));
        choiceRepository.save(new QuestChoice(first, 1, "첫 번째 선택", true, "좋아요!"));
        choiceRepository.save(new QuestChoice(second, 1, "다음 단계 선택", true, "잘했어요!"));

        QuestDetailResponse response = questService.findQuestDetail(quest.getId());

        assertEquals(2, response.steps().size());
        assertEquals(1, response.steps().getFirst().stepOrder());
        assertEquals("첫 번째 선택", response.steps().getFirst().choices().getFirst().label());
        assertEquals(2, response.steps().getFirst().choices().get(1).choiceOrder());
    }
}
