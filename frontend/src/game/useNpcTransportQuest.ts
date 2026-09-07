import { startSessionAnalysisJob } from '../api/behaviorAnalysis';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  abandonQuestSession,
  completeQuestSession,
  getQuestDetail,
  getQuests,
  getRecommendedQuests,
  type QuestChoice,
  type QuestDetail,
  startQuestSession,
} from '../api/quest';
import {
  flushQuestEventQueue,
  getQueuedQuestEventCount,
  queueQuestEvent,
} from '../api/questEventQueue';
import {
  evictQuestGenerationSnapshot,
  warmFullQuest,
} from '../ai/questGenerationStore';

export type NpcTransportQuestStage = 'idle' | 'loading' | 'question' | 'result' | 'error';

export function useNpcTransportQuest({
  accessToken,
  onCompleted,
}: {
  accessToken: string | null;
  onCompleted: () => void;
}) {
  const [stage, setStage] = useState<NpcTransportQuestStage>('idle');
  const [quest, setQuest] = useState<QuestDetail | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submittedChoice, setSubmittedChoice] = useState<QuestChoice | null>(null);
  const [contentSource, setContentSource] = useState<'ai' | 'original'>('original');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const attemptsRef = useRef<Record<string, number>>({});
  const stepStartedAtRef = useRef(Date.now());
  const sessionIdRef = useRef<string | null>(null);
  const completionRequestedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const abandonActiveSession = useCallback(() => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!accessToken || !sessionId || completionRequestedRef.current) return;
    void (async () => {
      try {
        await flushQuestEventQueue();
        if (getQueuedQuestEventCount() === 0) {
          await abandonQuestSession(sessionId, accessToken, 'NPC_QUIZ_EXIT');
        }
      } catch {
        // 게임 화면 종료를 수행 기록 동기화 실패가 막지 않게 한다.
      }
    })();
  }, [accessToken]);

  const resetQuestion = useCallback(() => {
    setStepIndex(0);
    setSelectedChoiceId(null);
    setSubmittedChoice(null);
    setErrorMessage(null);
    setSyncNotice(null);
    setContentSource('original');
    attemptsRef.current = {};
    stepStartedAtRef.current = Date.now();
    completionRequestedRef.current = false;
  }, []);

  const open = useCallback(async () => {
    abandonActiveSession();
    resetQuestion();
    setQuest(null);
    setStage('loading');
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    try {
      const summaries = accessToken
        ? await getRecommendedQuests(accessToken)
        : await getQuests();
      const summary = summaries.find((item) => item.categoryCode === 'PUBLIC_TRANSPORT');
      if (!summary) throw new Error('대중교통 퀘스트를 찾지 못했어요.');

      const originalQuest = await getQuestDetail(summary.id);
      if (originalQuest.steps.length === 0) {
        throw new Error('대중교통 퀘스트 단계가 비어 있어요.');
      }

      const [generation, session] = await Promise.all([
        accessToken
          ? warmFullQuest(originalQuest, accessToken)
          : Promise.resolve(null),
        accessToken
          ? startQuestSession(originalQuest.id, accessToken).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (requestSequenceRef.current !== requestSequence) return;

      const preparedQuest = generation?.quest ?? originalQuest;
      setQuest(preparedQuest);
      setContentSource(generation?.sources.some((source) => source === 'ai') ? 'ai' : 'original');
      sessionIdRef.current = session?.id ?? null;
      if (accessToken && !session) {
        setSyncNotice('수행 기록은 연결이 복구되면 다시 시도할 수 있어요.');
      }
      stepStartedAtRef.current = Date.now();
      setStage('question');
    } catch (error) {
      if (requestSequenceRef.current !== requestSequence) return;
      setErrorMessage(error instanceof Error ? error.message : '퀘스트를 준비하지 못했어요.');
      setStage('error');
    }
  }, [abandonActiveSession, accessToken, resetQuestion]);

  const selectChoice = useCallback((choiceId: string) => {
    const step = quest?.steps[stepIndex];
    const choice = step?.choices.find((item) => item.id === choiceId);
    if (!step || !choice || submittedChoice !== null) return;

    const attemptNumber = (attemptsRef.current[step.id] ?? 0) + 1;
    attemptsRef.current[step.id] = attemptNumber;
    setSelectedChoiceId(choice.id);
    setSubmittedChoice(choice);

    const sessionId = sessionIdRef.current;
    if (!accessToken || !sessionId) return;
    queueQuestEvent({
      accessToken,
      sessionId,
      request: {
        attemptNumber,
        choiceId: choice.id,
        hintUsed: false,
        responseTimeMs: Math.max(0, Date.now() - stepStartedAtRef.current),
        stepId: step.id,
        presentedContent: { goal: quest!.goal, situation: step.situation, instruction: step.instruction,
          hint: null, choices: step.choices.map(({ id, label }) => ({ id, label })) },
      },
    });
    void flushQuestEventQueue().then(() => {
      setSyncNotice(getQueuedQuestEventCount() === 0 ? null : '선택 기록을 임시 저장했어요.');
    });
  }, [accessToken, quest, stepIndex, submittedChoice !== null]);

  const advance = useCallback(() => {
    if (!quest || submittedChoice === null) return;
    if (stepIndex < quest.steps.length - 1) {
      setStepIndex((current) => current + 1);
      setSelectedChoiceId(null);
      setSubmittedChoice(null);
      stepStartedAtRef.current = Date.now();
      return;
    }

    completionRequestedRef.current = true;
    setStage('result');
    setSyncNotice('AI 수행 검토 중이에요. 보상은 자동 지급하지 않아요.');
    evictQuestGenerationSnapshot(quest.id);
    const sessionId = sessionIdRef.current;
    if (!accessToken || !sessionId) return;
    void (async () => {
      try {
        await flushQuestEventQueue();
        if (getQueuedQuestEventCount() > 0) throw new Error('기록 전송 대기 중');
        await completeQuestSession(sessionId, accessToken);
        sessionIdRef.current = null;
        await startSessionAnalysisJob(accessToken, sessionId);
        setSyncNotice('분석을 접수했어요. 분석 탭에서 진행 상태와 결과를 확인할 수 있어요.');
      } catch {
        setSyncNotice('완료 기록을 아직 전송하지 못했어요.');
      }
    })();
  }, [accessToken, onCompleted, quest, stepIndex, submittedChoice !== null]);

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
    abandonActiveSession();
    setStage('idle');
    setQuest(null);
    resetQuestion();
  }, [abandonActiveSession, resetQuestion]);

  useEffect(() => () => {
    requestSequenceRef.current += 1;
    abandonActiveSession();
  }, [abandonActiveSession]);

  return {
    advance,
    close,
    contentSource,
    errorMessage,
    open,
    quest,
    selectedChoiceId,
    selectChoice,
    stage,
    step: quest?.steps[stepIndex] ?? null,
    stepIndex,
    submittedChoice,
    syncNotice,
  };
}
