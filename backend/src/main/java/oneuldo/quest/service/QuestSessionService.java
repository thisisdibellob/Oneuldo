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

        if (questEventRepository.existsBySessionIdAndStepIdAndCorrectTrue(sessionId, step.getId())) {
            throw conflict("이미 완료한 단계입니다.");
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
        if (event.isCorrect()) {
            session.completeStep();
        }

        return toEventResponse(event, session);
    }

    @Transactional
    public QuestSessionResponse complete(UUID memberId, UUID sessionId) {
        QuestSession session = findOwnedSession(memberId, sessionId);
        requireInProgress(session);
        if (session.getCompletedSteps() != session.getTotalSteps()) {
            throw conflict("모든 단계를 완료한 뒤 세션을 완료할 수 있습니다.");
        }

        session.complete(session.getQuest().getRewardPoints());
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
                event.isCorrect(),
                event.getChoice().getFeedback(),
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
