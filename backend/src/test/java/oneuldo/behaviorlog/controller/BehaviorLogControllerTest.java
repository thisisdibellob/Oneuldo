package oneuldo.behaviorlog.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
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

    @Test
    void 장보기_이동_배치를_필드_손실_없이_저장한다() throws Exception {
        String suffix = UUID.randomUUID().toString();
        Member member = memberRepository.save(new Member(
                "market-controller-" + suffix,
                "encoded-password",
                "장보기 로그 사용자",
                suffix + "@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
        String accessToken = jwtTokenProvider.createAccessToken(member);
        UUID batchId = UUID.randomUUID();
        String eventBody = """
                {
                  "metadata": {
                    "clientEventId": "%s",
                    "eventSequence": 12,
                    "eventSchemaVersion": "behavior-event-v1",
                    "appVersion": "1.0.0",
                    "contentVersion": "market-micro-behavior-v1",
                    "offlineQueued": true,
                    "occurredAt": "2026-09-03T10:00:00Z"
                  },
                  "identity": { "sessionId": "%s" },
                  "task": {
                    "gameId": "MARKET_SIMULATION",
                    "taskId": "%s",
                    "taskVersion": "market-micro-behavior-v1",
                    "difficulty": 2,
                    "scenarioVariant": "BASELINE",
                    "evidenceContext": "ASSESSMENT_TASK"
                  },
                  "action": {
                    "eventCode": "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
                    "microActionId": "MOVE_SEGMENT",
                    "stepOrder": 12
                  },
                  "accessibility": {
                    "instructionMode": "TEXT",
                    "textLevel": "STANDARD",
                    "audioEnabled": false,
                    "symbolSupport": true,
                    "controllerMode": "TOUCH"
                  },
                  "payload": {
                    "type": "SHOPPING",
                    "thresholdRuleVersion": "market-detection-rules-v1",
                    "controlMode": "joystick",
                    "durationMs": 5000,
                    "pathDistance": 142.5,
                    "straightDistance": 80.25,
                    "travelDistance": 142.5,
                    "stationId": "produce",
                    "visitIndex": 2,
                    "intervalSinceLastVisitMs": 31000,
                    "stationSequence": ["produce", "meal", "produce"]
                  }
                }
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        String batchBody = """
                {
                  "batchId": "%s",
                  "events": [%s]
                }
                """.formatted(batchId, eventBody);

        mockMvc.perform(post("/api/behavior-logs/batches")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(batchBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(batchId.toString()))
                .andExpect(jsonPath("$.events[0].status").value("ACCEPTED"));

        ShoppingBehaviorPayload payload = assertInstanceOf(
                ShoppingBehaviorPayload.class, behaviorLogRepository.findAll().getFirst().getPayload());

        assertEquals("market-detection-rules-v1", payload.thresholdRuleVersion());
        assertEquals("joystick", payload.controlMode());
        assertEquals(5000L, payload.durationMs());
        assertEquals(142.5, payload.travelDistance());
        assertEquals(java.util.List.of("produce", "meal", "produce"), payload.stationSequence());
    }
}
