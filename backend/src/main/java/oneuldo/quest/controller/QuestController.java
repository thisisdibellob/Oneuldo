package oneuldo.quest.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import oneuldo.quest.dto.QuestAbandonRequest;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestEventRequest;
import oneuldo.quest.dto.QuestEventResponse;
import oneuldo.quest.dto.QuestSessionResponse;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.quest.service.QuestService;
import oneuldo.quest.service.QuestSessionService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/quest")
@RequiredArgsConstructor
public class QuestController {

    private final QuestService questService;
    private final QuestSessionService questSessionService;

    @GetMapping
    public List<QuestSummaryResponse> getQuests() {
        return questService.findActiveQuests();
    }

    @GetMapping("/{uuid}")
    public QuestSummaryResponse getQuest(@PathVariable UUID uuid) {
        return questService.findQuest(uuid);
    }

    // 퀘스트 기본 정보와 단계, 선택지를 함께 조회한다.
    @GetMapping("/{uuid}/detail")
    public QuestDetailResponse getQuestDetail(@PathVariable UUID uuid) {
        return questService.findQuestDetail(uuid);
    }

    @PostMapping("/{uuid}/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public QuestSessionResponse startSession(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID uuid
    ) {
        return questSessionService.start(memberId(jwt), uuid);
    }

    @GetMapping("/sessions/{sessionId}")
    public QuestSessionResponse getSession(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId
    ) {
        return questSessionService.find(memberId(jwt), sessionId);
    }

    @PostMapping("/sessions/{sessionId}/events")
    @ResponseStatus(HttpStatus.CREATED)
    public QuestEventResponse recordEvent(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @Valid @RequestBody QuestEventRequest request
    ) {
        return questSessionService.recordEvent(memberId(jwt), sessionId, request);
    }

    @PostMapping("/sessions/{sessionId}/complete")
    public QuestSessionResponse completeSession(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId
    ) {
        return questSessionService.complete(memberId(jwt), sessionId);
    }

    @PostMapping("/sessions/{sessionId}/abandon")
    public QuestSessionResponse abandonSession(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @Valid @RequestBody(required = false) QuestAbandonRequest request
    ) {
        return questSessionService.abandon(
                memberId(jwt),
                sessionId,
                request == null ? null : request.reason()
        );
    }

    private UUID memberId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
