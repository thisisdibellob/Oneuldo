package oneuldo.quest.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestCategory;
import oneuldo.quest.domain.QuestChoice;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestStep;
import oneuldo.quest.domain.QuestSubcategory;
import oneuldo.quest.repository.QuestCategoryRepository;
import oneuldo.quest.repository.QuestChoiceRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestSessionRepository;
import oneuldo.quest.repository.QuestStepRepository;
import oneuldo.quest.repository.QuestSubcategoryRepository;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class QuestControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private MemberRepository memberRepository;
    @Autowired private QuestCategoryRepository categoryRepository;
    @Autowired private QuestSubcategoryRepository subcategoryRepository;
    @Autowired private QuestRepository questRepository;
    @Autowired private QuestStepRepository stepRepository;
    @Autowired private QuestChoiceRepository choiceRepository;
    @Autowired private QuestSessionRepository sessionRepository;

    @Test
    void 상세_조회와_인증된_수행_기록_API가_연결된다() throws Exception {
        Member member = memberRepository.save(new Member(
                "controller-user",
                "encoded-password",
                "컨트롤러 사용자",
                "controller@example.com",
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
                "버스를 이용해요.",
                "버스 번호를 확인한다.",
                QuestDifficulty.EASY,
                20,
                true
        ));
        QuestStep step = stepRepository.save(new QuestStep(
                quest, 1, "번호 확인", "정류장", "번호를 찾아보세요."
        ));
        QuestChoice choice = choiceRepository.save(new QuestChoice(
                step, 1, "버스 번호를 확인한다.", true, "좋아요!"
        ));

        mockMvc.perform(get("/api/quest/{uuid}/detail", quest.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.steps.length()").value(1))
                .andExpect(jsonPath("$.steps[0].choices[0].label").value("버스 번호를 확인한다."));

        mockMvc.perform(post("/api/quest/{uuid}/sessions", quest.getId()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/quest/recommended"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/ai/quest-step/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        String accessToken = jwtTokenProvider.createAccessToken(member);
        mockMvc.perform(get("/api/quest/recommended")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].difficulty").value("EASY"));

        mockMvc.perform(post("/api/quest/{uuid}/sessions", quest.getId())
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        var session = sessionRepository.findAll().getFirst();
        String requestBody = """
                {
                  "stepId": "%s",
                  "choiceId": "%s",
                  "attemptNumber": 1,
                  "correct": false,
                  "hintUsed": false,
                  "responseTimeMs": 1200
                }
                """.formatted(step.getId(), choice.getId());

        mockMvc.perform(post("/api/quest/sessions/{sessionId}/events", session.getId())
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.correct").doesNotExist())
                .andExpect(jsonPath("$.completedSteps").value(1));
    }
}
