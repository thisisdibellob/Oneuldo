package oneuldo.quest.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import oneuldo.quest.domain.DifficultyAdjustmentDecision;
import oneuldo.quest.domain.DifficultyAdjustmentHistory;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestEvent;
import oneuldo.quest.domain.QuestSession;
import oneuldo.quest.domain.QuestSessionStatus;
import oneuldo.quest.domain.UserSubcategoryDifficulty;
import oneuldo.quest.repository.DifficultyAdjustmentHistoryRepository;
import oneuldo.quest.repository.QuestEventRepository;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.quest.repository.QuestSessionRepository;
import oneuldo.quest.repository.UserSubcategoryDifficultyRepository;

@Service
@RequiredArgsConstructor
public class DifficultyAdjustmentService {

    private static final int SAMPLE_SESSION_LIMIT = 3;

    private final UserSubcategoryDifficultyRepository difficultyRepository;
    private final DifficultyAdjustmentHistoryRepository historyRepository;
    private final QuestSessionRepository sessionRepository;
    private final QuestEventRepository eventRepository;
    private final QuestRepository questRepository;
    private final DifficultyAdjustmentPolicy policy;

    // 완료·중단 직후 호출되며 같은 세부 분야의 최근 수행만 평가한다.
    @Transactional
    public void recordTerminalSession(QuestSession terminalSession) {
        UUID memberId = terminalSession.getMember().getId();
        var subcategory = terminalSession.getQuest().getSubcategory();
        UserSubcategoryDifficulty state = difficultyRepository
                .findByMemberIdAndSubcategoryId(memberId, subcategory.getId())
                .orElseGet(() -> difficultyRepository.save(new UserSubcategoryDifficulty(
                        terminalSession.getMember(),
                        subcategory,
                        DifficultyAdjustmentPolicy.RULE_VERSION
                )));

        // 다른 난이도를 임의로 수행한 기록은 현재 단계의 승급·하향 표본에 섞지 않는다.
        if (terminalSession.getQuestDifficulty() != state.getCurrentDifficulty()) {
            return;
        }

        state.recordEligibleSession();
        if (state.getSessionsSinceEvaluation() < 2) {
            return;
        }

        List<QuestSession> sessions = sessionRepository.findRecentTerminalSessions(
                memberId,
                subcategory.getId(),
                state.getCurrentDifficulty(),
                PageRequest.of(0, SAMPLE_SESSION_LIMIT)
        );
        DifficultyMetrics metrics = calculateMetrics(sessions);
        QuestDifficulty currentDifficulty = state.getCurrentDifficulty();
        QuestDifficulty higher = currentDifficulty.higher();
        QuestDifficulty lower = currentDifficulty.lower();
        boolean higherContentExists = higher != null && questRepository
                .existsBySubcategoryIdAndDifficultyAndActiveTrue(subcategory.getId(), higher);
        boolean lowerContentExists = lower != null && questRepository
                .existsBySubcategoryIdAndDifficultyAndActiveTrue(subcategory.getId(), lower);
        Instant now = Instant.now();
        QuestDifficulty previous = state.getCurrentDifficulty();
        DifficultyAdjustmentResult result = policy.evaluate(
                previous,
                metrics,
                higherContentExists,
                lowerContentExists,
                state.getLastChangedAt(),
                now
        );

        historyRepository.save(new DifficultyAdjustmentHistory(
                state,
                previous,
                result.nextDifficulty(),
                result.decision(),
                result.reasonCodes(),
                metrics,
                DifficultyAdjustmentPolicy.RULE_VERSION,
                now
        ));

        // 두 번째 세션의 데이터 부족 판정은 세 번째 세션까지 이어서 누적한다.
        if (result.decision() != DifficultyAdjustmentDecision.DATA_INSUFFICIENT) {
            state.finishEvaluation(result.nextDifficulty(), DifficultyAdjustmentPolicy.RULE_VERSION, now);
        }
    }

    @Transactional(readOnly = true)
    public Map<UUID, QuestDifficulty> findCurrentDifficulties(UUID memberId) {
        Map<UUID, QuestDifficulty> result = new HashMap<>();
        difficultyRepository.findAllByMemberId(memberId).forEach(state ->
                result.put(state.getSubcategory().getId(), state.getCurrentDifficulty())
        );
        return result;
    }

    private DifficultyMetrics calculateMetrics(List<QuestSession> sessions) {
        if (sessions.isEmpty()) {
            return DifficultyMetrics.empty();
        }

        List<UUID> sessionIds = sessions.stream().map(QuestSession::getId).toList();
        List<QuestEvent> events = eventRepository.findAllForSessions(sessionIds);
        Map<StepKey, StepPerformance> steps = new HashMap<>();
        for (QuestEvent event : events) {
            StepKey key = new StepKey(event.getSession().getId(), event.getStep().getId());
            StepPerformance performance = steps.computeIfAbsent(key, ignored -> new StepPerformance());
            if (event.getAttemptNumber() == 1) {
                performance.firstAttemptCorrect = event.isCorrect();
            }
            performance.hintUsed |= event.isHintUsed();
            performance.retried |= event.getAttemptNumber() > 1;
        }

        int stepCount = steps.size();
        long completed = sessions.stream()
                .filter(session -> session.getStatus() == QuestSessionStatus.COMPLETED)
                .count();
        long firstCorrect = steps.values().stream().filter(step -> step.firstAttemptCorrect).count();
        long hinted = steps.values().stream().filter(step -> step.hintUsed).count();
        long retried = steps.values().stream().filter(step -> step.retried).count();
        int distinctQuests = (int) sessions.stream()
                .map(session -> session.getQuest().getId())
                .distinct()
                .count();

        int consecutiveAbandons = 0;
        for (QuestSession session : sessions) {
            if (session.getStatus() != QuestSessionStatus.ABANDONED) break;
            consecutiveAbandons++;
        }

        return new DifficultyMetrics(
                sessions.size(),
                stepCount,
                rate(completed, sessions.size()),
                rate(firstCorrect, stepCount),
                rate(hinted, stepCount),
                rate(retried, stepCount),
                distinctQuests,
                consecutiveAbandons
        );
    }

    private double rate(long numerator, long denominator) {
        return denominator == 0 ? 0 : (double) numerator / denominator;
    }

    private record StepKey(UUID sessionId, UUID stepId) {
    }

    private static final class StepPerformance {
        private boolean firstAttemptCorrect;
        private boolean hintUsed;
        private boolean retried;
    }
}
