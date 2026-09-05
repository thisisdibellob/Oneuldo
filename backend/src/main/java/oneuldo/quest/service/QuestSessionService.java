package oneuldo.quest.service;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestChoice;
import oneuldo.quest.domain.QuestEvent;
import oneuldo.quest.domain.QuestSession;
import oneuldo.quest.domain.QuestSessionStatus;
import oneuldo.quest.domain.QuestStep;
import oneuldo.quest.dto.QuestEventRequest;
import oneuldo.quest.dto.QuestEventResponse;
import oneuldo.quest.dto.QuestSessionResponse;
import oneuldo.quest.repository.QuestChoiceRepository;
import oneuldo.quest.repository.QuestEventRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestSessionRepository;
import oneuldo.quest.repository.QuestStepRepository;

@Service
@RequiredArgsConstructor
public class QuestSessionService {

    private final MemberRepository memberRepository;
    private final QuestRepository questRepository;
    private final QuestStepRepository questStepRepository;
    private final QuestChoiceRepository questChoiceRepository;
    private final QuestSessionRepository questSessionRepository;
    private final QuestEventRepository questEventRepository;
    private final oneuldo.behaviorlog.service.BehaviorLogService behaviorLogs;
    private final tools.jackson.databind.ObjectMapper mapper;

    @Transactional
    public QuestSessionResponse start(UUID memberId, UUID questId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> notFound("사용자를 찾을 수 없습니다."));
        Quest quest = questRepository.findById(questId)
                .filter(Quest::isActive)
                .orElseThrow(() -> notFound("퀘스트를 찾을 수 없습니다."));

        int totalSteps = Math.toIntExact(questStepRepository.countByQuestId(questId));
        if (totalSteps == 0) {
            throw conflict("수행할 단계가 없는 퀘스트입니다.");
        }

        return QuestSessionResponse.from(
                questSessionRepository.save(new QuestSession(member, quest, totalSteps))
        );
    }

    @Transactional(readOnly = true)
    public QuestSessionResponse find(UUID memberId, UUID sessionId) {
        return QuestSessionResponse.from(findOwnedSession(memberId, sessionId));
    }

    @Transactional
    public QuestEventResponse recordEvent(
            UUID memberId,
            UUID sessionId,
            QuestEventRequest request
    ) {
        QuestSession session = findOwnedSession(memberId, sessionId);
        requireInProgress(session);

        QuestStep step = questStepRepository.findById(request.stepId())
                .orElseThrow(() -> notFound("퀘스트 단계를 찾을 수 없습니다."));
        if (!step.getQuest().getId().equals(session.getQuest().getId())) {
            throw badRequest("현재 세션에 속하지 않은 단계입니다.");
        }

        QuestChoice choice = questChoiceRepository.findById(request.choiceId())
                .orElseThrow(() -> notFound("선택지를 찾을 수 없습니다."));
        if (!choice.getStep().getId().equals(step.getId())) {
            throw badRequest("현재 단계에 속하지 않은 선택지입니다.");
        }

        var existing = questEventRepository.findBySessionIdAndStepIdAndAttemptNumber(
                sessionId,
                step.getId(),
                request.attemptNumber()
        );
        if (existing.isPresent()) {
            QuestEvent event = existing.get();
            if (!event.getChoice().getId().equals(choice.getId())) {
                throw conflict("같은 시도 번호로 다른 선택을 기록할 수 없습니다.");
            }
            return toEventResponse(event, session);
        }


        int expectedAttempt = Math.toIntExact(
                questEventRepository.countBySessionIdAndStepId(sessionId, step.getId()) + 1
        );
        if (request.attemptNumber() != expectedAttempt) {
            throw conflict("시도 번호가 올바르지 않습니다. 다음 번호: " + expectedAttempt);
        }

        QuestEvent event = questEventRepository.save(new QuestEvent(
                session,
                step,
                choice,
                request.attemptNumber(),
                request.hintUsed(),
                request.responseTimeMs()
        ));
        if (expectedAttempt == 1) session.completeStep(); // submitted-step count, not successful-step count
        var content = request.presentedContent();
        if (content != null && mapper.writeValueAsString(content).length() > 16000)
            throw badRequest("표시 문맥이 너무 큽니다.");
        var raw = new java.util.LinkedHashMap<String, Object>();
        long sequence = questEventRepository.findAllBySessionIdOrderByCreatedAtAsc(sessionId).size();
        raw.put("metadata", java.util.Map.of("clientEventId", UUID.nameUUIDFromBytes(("transport:" + event.getId()).getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                "eventSequence", sequence, "eventSchemaVersion", "behavior-event-v1", "appVersion", "transport-observation-v1",
                "contentVersion", "transport-client-snapshot-v1", "occurredAt", event.getCreatedAt()));
        raw.put("identity", java.util.Map.of("sessionId", sessionId));
        raw.put("task", java.util.Map.of("gameId", "TRANSPORT_QUEST", "taskId", session.getQuest().getId(),
                "taskVersion", "transport-observation-v1", "difficulty", session.getQuestDifficulty().ordinal(),
                "scenarioVariant", session.getQuest().getCode(), "evidenceContext", "TRAINING_TASK"));
        raw.put("action", java.util.Map.of("eventCode", "TRANSPORT.CHOICE_SUBMITTED", "microActionId", "SELECT_CHOICE",
                "stepId", step.getId(), "stepOrder", step.getStepOrder()));
        raw.put("accessibility", java.util.Map.of("instructionMode", "TEXT", "textLevel", "STANDARD",
                "audioEnabled", false, "symbolSupport", false, "controllerMode", "OTHER"));
        var payload = new java.util.LinkedHashMap<String, Object>();
        payload.put("type", "TRANSPORT"); payload.put("presentedContent", content);
        payload.put("selectedChoiceId", choice.getId().toString()); payload.put("attemptNumber", request.attemptNumber());
        payload.put("hintUsed", request.hintUsed()); payload.put("responseTimeMs", request.responseTimeMs());
        payload.put("observationScope", content == null ? "Displayed scene unavailable; do not substitute current DB wording." : "Client-reported wording; viewport/comprehension not observed.");
        raw.put("payload", payload);
        behaviorLogs.record(memberId, mapper.convertValue(raw, oneuldo.behaviorlog.domain.BehaviorLogRequest.class));

        return toEventResponse(event, session);
    }

    @Transactional
    public QuestSessionResponse complete(UUID memberId, UUID sessionId) {
        QuestSession session = findOwnedSession(memberId, sessionId);
        requireInProgress(session);
        if (session.getCompletedSteps() != session.getTotalSteps()) {
            throw conflict("모든 단계를 완료한 뒤 세션을 완료할 수 있습니다.");
        }

        session.submit();
        return QuestSessionResponse.from(session);
    }

    @Transactional
    public QuestSessionResponse abandon(UUID memberId, UUID sessionId, String reason) {
        QuestSession session = findOwnedSession(memberId, sessionId);
        requireInProgress(session);
        session.abandon(reason == null || reason.isBlank() ? "USER_EXIT" : reason.trim());
        return QuestSessionResponse.from(session);
    }

    private QuestSession findOwnedSession(UUID memberId, UUID sessionId) {
        return questSessionRepository.findByIdAndMemberId(sessionId, memberId)
                .orElseThrow(() -> notFound("퀘스트 세션을 찾을 수 없습니다."));
    }

    private void requireInProgress(QuestSession session) {
        if (session.getStatus() != QuestSessionStatus.IN_PROGRESS) {
            throw conflict("진행 중인 세션에서만 수행할 수 있습니다.");
        }
    }

    private QuestEventResponse toEventResponse(QuestEvent event, QuestSession session) {
        return new QuestEventResponse(
                event.getId(),
                event.getAttemptNumber(),
                event.getCorrect(),
                "선택을 기록했습니다. 수행 판단은 AI 검토에서 확인하세요.",
                session.getCompletedSteps(),
                session.getTotalSteps()
        );
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
