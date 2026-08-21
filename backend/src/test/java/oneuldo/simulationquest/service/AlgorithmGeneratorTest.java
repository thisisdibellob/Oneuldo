package oneuldo.simulationquest.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.time.LocalDate;
import java.util.Set;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberQuestProfile;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.domain.SupportLevel;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.member.repository.MemberRepository;
import oneuldo.place.domain.Place;
import oneuldo.place.repository.PlaceRepository;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestCategory;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestSubcategory;
import oneuldo.quest.repository.QuestCategoryRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestSubcategoryRepository;
import oneuldo.simulationquest.domain.Simulation;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.repository.SimulationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class AlgorithmGeneratorTest {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private MemberQuestProfileRepository profileRepository;

    @Autowired
    private QuestCategoryRepository categoryRepository;

    @Autowired
    private QuestSubcategoryRepository subcategoryRepository;

    @Autowired
    private QuestRepository questRepository;

    @Autowired
    private PlaceRepository placeRepository;

    @Autowired
    private SimulationRepository simulationRepository;

    @Autowired
    private SimulationQuestGenerator generator;

    @Test
    void 회원_프로필의_선호도에_맞는_시뮬레이션_퀘스트를_생성한다() {
        Member member = memberRepository.save(new Member(
                "algorithm-user",
                "encoded-password",
                "테스트 회원",
                "algorithm@example.com",
                MemberRole.PARENT,
                LocalDate.of(2000, 1, 1)
        ));

        profileRepository.save(new MemberQuestProfile(
                member,
                QuestDifficulty.NORMAL,
                SupportLevel.GUIDED,
                15,
                3,
                Set.of("PUBLIC_TRANSPORT")
        ));

        QuestCategory category = categoryRepository.save(
                new QuestCategory("TEST_LIFE", "생활", 1, true)
        );
        QuestSubcategory preferredSubcategory = subcategoryRepository.save(
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
        QuestSubcategory otherSubcategory = subcategoryRepository.save(
                new QuestSubcategory(
                        category,
                        "DAILY_LIFE",
                        "생활 훈련",
                        QuestDifficulty.VERY_EASY,
                        QuestDifficulty.VERY_HARD,
                        2,
                        true
                )
        );

        Quest preferredQuest = questRepository.save(new Quest(
                preferredSubcategory,
                "TEST_TAKE_BUS",
                "버스 타기",
                "버스를 이용한다.",
                "버스를 혼자 이용할 수 있다.",
                QuestDifficulty.NORMAL,
                30,
                true
        ));
        questRepository.save(new Quest(
                otherSubcategory,
                "TEST_DAILY_LIFE",
                "정리하기",
                "물건을 정리한다.",
                "물건을 제자리에 둘 수 있다.",
                QuestDifficulty.NORMAL,
                30,
                true
        ));

        Place place = placeRepository.save(new Place("TEST_BUS_STOP", "버스 정류장", true));
        Simulation simulation = simulationRepository.save(new Simulation(
                preferredQuest.getId(),
                place.getId(),
                "목적지 버스 찾기",
                "버스 번호를 확인하고 탑승한다.",
                true
        ));

        SimulationQuest result = generator.create(member);

        assertNotNull(result.getId());
        assertEquals(preferredQuest.getId(), result.getQuest().getId());
        assertEquals("TEST_BUS_STOP", result.getPlaceId());
        assertEquals(simulation.getId(), result.getSimulation().getId());
        assertEquals(0, result.getDialogues().size());
    }
}
