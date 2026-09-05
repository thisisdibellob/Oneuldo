package oneuldo.quest.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestCategory;
import oneuldo.quest.domain.QuestChoice;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestEvent;
import oneuldo.quest.domain.QuestStep;
import oneuldo.quest.domain.QuestSubcategory;
import oneuldo.quest.dto.QuestEventRequest;
import oneuldo.quest.dto.QuestEventResponse;
import oneuldo.quest.dto.QuestSessionResponse;
import oneuldo.quest.repository.QuestCategoryRepository;
import oneuldo.quest.repository.QuestChoiceRepository;
import oneuldo.quest.repository.QuestEventRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestStepRepository;
import oneuldo.quest.repository.QuestSubcategoryRepository;

@SpringBootTest
@Transactional
class QuestSessionServiceTest {

    @Autowired private MemberRepository memberRepository;
    @Autowired private QuestCategoryRepository categoryRepository;
    @Autowired private QuestSubcategoryRepository subcategoryRepository;
    @Autowired private QuestRepository questRepository;
    @Autowired private QuestStepRepository stepRepository;
    @Autowired private QuestChoiceRepository choiceRepository;
    @Autowired private QuestEventRepository eventRepository;
    @Autowired private QuestSessionService sessionService;

    @Test
    void 선택은_판정없이_반복기록하고_보상없이_제출한다() {
        Fixture fixture = createFixture();
        QuestSessionResponse session = sessionService.start(
                fixture.member().getId(),
                fixture.quest().getId()
        );

        QuestEventResponse firstWrong = sessionService.recordEvent(
                fixture.member().getId(),
                session.id(),
                new QuestEventRequest(
                        fixture.firstStep().getId(),
                        fixture.wrongChoice().getId(),
                        1,
                        false,
                        1_200
                )
        );
        QuestEventResponse secondWrong = sessionService.recordEvent(
                fixture.member().getId(),
                session.id(),
                new QuestEventRequest(
                        fixture.firstStep().getId(),
                        fixture.wrongChoice().getId(),
                        2,
                        true,
                        2_500
                )
        );
        QuestEventResponse firstCorrect = sessionService.recordEvent(
                fixture.member().getId(),
                session.id(),
                new QuestEventRequest(
                        fixture.firstStep().getId(),
                        fixture.correctChoice().getId(),
                        3,
                        true,
                        900
                )
        );

        assertNull(firstWrong.correct());
        assertNull(secondWrong.correct());
        assertNull(firstCorrect.correct());
        assertEquals(1, firstCorrect.completedSteps());

        List<QuestEvent> events = eventRepository
                .findAllBySessionIdOrderByCreatedAtAsc(session.id());
        assertEquals(3, events.size());
        assertEquals(2, events.get(1).getAttemptNumber());
        assertTrue(events.get(1).isHintUsed());
        assertEquals(2_500, events.get(1).getResponseTimeMs());

        // 같은 요청을 재전송해도 이벤트가 중복 저장되지 않는다.
        sessionService.recordEvent(
                fixture.member().getId(),
                session.id(),
                new QuestEventRequest(
                        fixture.firstStep().getId(),
                        fixture.correctChoice().getId(),
                        3,
                        true,
                        900
                )
        );
        assertEquals(3, eventRepository.findAllBySessionIdOrderByCreatedAtAsc(session.id()).size());

        sessionService.recordEvent(
                fixture.member().getId(),
                session.id(),
                new QuestEventRequest(
                        fixture.secondStep().getId(),
                        fixture.secondCorrectChoice().getId(),
                        1,
                        false,
                        700
                )
        );
        QuestSessionResponse completed = sessionService.complete(
                fixture.member().getId(),
                session.id()
        );

        assertEquals("SUBMITTED", completed.status());
        assertEquals(2, completed.completedSteps());
        assertEquals(0, completed.rewardPoints());
    }

    @Test
    void 다른_사용자는_세션을_조회하거나_수정할_수_없다() {
        Fixture fixture = createFixture();
        Member other = memberRepository.save(new Member(
                "other-user",
                "encoded-password",
                "다른 사용자",
                "other@example.com",
                MemberRole.CHILD,
                LocalDate.of(2001, 1, 1)
        ));
        QuestSessionResponse session = sessionService.start(
                fixture.member().getId(),
                fixture.quest().getId()
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> sessionService.find(other.getId(), session.id())
        );
        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void 중단한_세션에는_선택을_추가할_수_없다() {
        Fixture fixture = createFixture();
        QuestSessionResponse session = sessionService.start(
                fixture.member().getId(),
                fixture.quest().getId()
        );

        QuestSessionResponse abandoned = sessionService.abandon(
                fixture.member().getId(),
                session.id(),
                "USER_EXIT"
        );
        assertEquals("ABANDONED", abandoned.status());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> sessionService.recordEvent(
                        fixture.member().getId(),
                        session.id(),
                        new QuestEventRequest(
                                fixture.firstStep().getId(),
                                fixture.correctChoice().getId(),
                                1,
                                false,
                                500
                        )
                )
        );
        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    private Fixture createFixture() {
        Member member = memberRepository.save(new Member(
                "quest-user",
                "encoded-password",
                "퀘스트 사용자",
                "quest@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
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
                "버스를 안전하게 이용해요.",
                "버스 번호와 목적지를 확인한다.",
                QuestDifficulty.EASY,
                20,
                true
        ));
        QuestStep firstStep = stepRepository.save(new QuestStep(
                quest, 1, "버스 번호 확인", "정류장", "번호를 확인해 보세요."
        ));
        QuestStep secondStep = stepRepository.save(new QuestStep(
                quest, 2, "하차 버튼 누르기", "목적지 전", "버튼을 찾아보세요."
        ));
        QuestChoice wrongChoice = choiceRepository.save(new QuestChoice(
                firstStep, 1, "아무 버스나 탄다.", false, "번호를 먼저 확인해 보세요."
        ));
        QuestChoice correctChoice = choiceRepository.save(new QuestChoice(
                firstStep, 2, "버스 번호를 확인한다.", true, "좋아요!"
        ));
        QuestChoice secondCorrectChoice = choiceRepository.save(new QuestChoice(
                secondStep, 1, "하차 버튼을 누른다.", true, "잘했어요!"
        ));
        return new Fixture(
                member,
                quest,
                firstStep,
                secondStep,
                wrongChoice,
                correctChoice,
                secondCorrectChoice
        );
    }

    private record Fixture(
            Member member,
            Quest quest,
            QuestStep firstStep,
            QuestStep secondStep,
            QuestChoice wrongChoice,
            QuestChoice correctChoice,
            QuestChoice secondCorrectChoice
    ) {
    }
}
