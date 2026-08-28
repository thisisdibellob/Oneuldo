package oneuldo.behaviorlog.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BehaviorLogControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private MemberRepository memberRepository;
    @Autowired private BehaviorLogRepository behaviorLogRepository;

    @Test
    void camelCase_요청을_JWT_사용자에게_귀속해_저장한다() throws Exception {
        Member member = memberRepository.save(new Member(
                "behavior-controller",
                "encoded-password",
                "행동 로그 사용자",
                "behavior-controller@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
        String accessToken = jwtTokenProvider.createAccessToken(member);
        UUID clientEventId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        String requestBody = """
                {
                  "metadata": {
                    "clientEventId": "%s",
                    "eventSequence": 1,
                    "eventSchemaVersion": "behavior-event-v1",
                    "appVersion": "1.0.0",
                    "contentVersion": "hygiene-content-v1",
                    "offlineQueued": false,
                    "devicePerformanceClass": "MEDIUM",
                    "occurredAt": "2026-08-28T10:00:00Z"
                  },
                  "identity": {
                    "sessionId": "%s"
                  },
                  "task": {
                    "gameId": "LIFE_SIMULATION",
                    "taskId": "%s",
                    "taskVersion": "hygiene-task-v1",
                    "difficulty": 1,
                    "scenarioVariant": "DEFAULT",
                    "evidenceContext": "TRAINING_TASK"
                  },
                  "action": {
                    "eventCode": "HYGIENE.TASK_STARTED",
                    "microActionId": "HYGIENE_TASK_START",
                    "stepOutcome": "SUCCESS",
                    "stepOrder": 1
                  },
                  "accessibility": {
                    "instructionMode": "PICTURE",
                    "textLevel": "EASY",
                    "audioEnabled": false,
                    "symbolSupport": true,
                    "controllerMode": "TOUCH"
                  },
                  "payload": {
                    "type": "HYGIENE_CLOTHING",
                    "hygieneTaskId": "BRUSH_TEETH",
                    "toolId": "TOOTHBRUSH",
                    "stepCompleted": true
                  }
                }
                """.formatted(clientEventId, sessionId, taskId);

        mockMvc.perform(post("/api/behavior-logs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/behavior-logs")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientEventId").value(clientEventId.toString()))
                .andExpect(jsonPath("$.eventSequence").value(1))
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        var saved = behaviorLogRepository.findAll().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals(member.getId(), saved.getMember().getId());
        org.junit.jupiter.api.Assertions.assertEquals(sessionId, saved.getSessionId());
    }
}
