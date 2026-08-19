import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  abandonQuestSession,
  completeQuestSession,
  QuestChoice,
  QuestDetail,
  QuestEventRequest,
  startQuestSession,
} from '../api/quest';
import { flushQuestEventQueue, getQueuedQuestEventCount, queueQuestEvent } from '../api/questEventQueue';
import { PressScale } from '../components/PressScale';
import { useQuestVariation } from '../ai/useQuestVariation';
import { colors, fonts } from '../theme';

export function QuestPracticeScreen({
  accessToken,
  aiVariationEnabled,
  onBack,
  quest,
}: {
  accessToken: string | null;
  aiVariationEnabled: boolean;
  onBack: () => void;
  quest: QuestDetail | null;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submittedChoice, setSubmittedChoice] = useState<QuestChoice | null>(null);
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [hintUsed, setHintUsed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const stepStartedAt = useRef(Date.now());
  const sessionCompleted = useRef(false);
  const variation = useQuestVariation({ enabled: aiVariationEnabled, quest, stepIndex });

  useEffect(() => {
    if (!accessToken || !quest) return;
    let active = true;

    const start = async () => {
      try {
        await flushQuestEventQueue();
        const session = await startQuestSession(quest.id, accessToken);
        if (active) setSessionId(session.id);
      } catch {
        if (active) setSyncNotice('수행 기록은 연결이 복구되면 다시 시도할 수 있어요.');
      }
    };

    void start();
    return () => {
      active = false;
    };
  }, [accessToken, quest]);

  if (!quest || quest.steps.length === 0) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.mint} size="large" />
        <Text style={styles.loadingText}>퀘스트 단계를 준비하고 있어요.</Text>
        <PressScale accessibilityRole="button" onPress={onBack} style={styles.loadingBack}>
          <Text style={styles.buttonText}>목록으로 돌아가기</Text>
        </PressScale>
      </View>
    );
  }

  const step = variation.step ?? quest.steps[stepIndex];
  const wrong = submittedChoice !== null && !submittedChoice.correct;
  const correct = submittedChoice?.correct === true;

  const sendEvent = async (request: QuestEventRequest) => {
    if (!accessToken || !sessionId) return;
    // 모든 이벤트를 같은 FIFO 큐로 보내 반복 선택의 순서를 보장한다.
    queueQuestEvent({ accessToken, request, sessionId });
    await flushQuestEventQueue();
    setSyncNotice(getQueuedQuestEventCount() === 0 ? null : '선택 기록을 임시 저장했어요.');
  };

  const submitChoice = () => {
    const choice = step.choices.find((item) => item.id === selectedChoiceId);
    if (!choice) return;

    const attemptNumber = (attempts[step.id] ?? 0) + 1;
    const request: QuestEventRequest = {
      attemptNumber,
      choiceId: choice.id,
      hintUsed,
      responseTimeMs: Math.max(0, Date.now() - stepStartedAt.current),
      stepId: step.id,
    };

    setAttempts((current) => ({ ...current, [step.id]: attemptNumber }));
    setSubmittedChoice(choice);
    if (choice.correct) setCorrectCount((count) => count + 1);
    void sendEvent(request);
  };

  const retryStep = () => {
    setSelectedChoiceId(null);
    setSubmittedChoice(null);
    stepStartedAt.current = Date.now();
  };

  const moveToNextStep = () => {
    setStepIndex((index) => index + 1);
    setSelectedChoiceId(null);
    setSubmittedChoice(null);
    setHintUsed(false);
    stepStartedAt.current = Date.now();
  };

  const finishQuest = async () => {
    setShowResult(true);
    if (!accessToken || !sessionId) return;
    try {
      await flushQuestEventQueue();
      if (getQueuedQuestEventCount() > 0) {
        throw new Error('기록 전송 대기 중');
      }
      await completeQuestSession(sessionId, accessToken);
      sessionCompleted.current = true;
      setSyncNotice(null);
    } catch {
      setSyncNotice('완료 기록을 아직 전송하지 못했어요.');
    }
  };

  const closePractice = () => {
    if (accessToken && sessionId && !sessionCompleted.current) {
      void (async () => {
        try {
          await flushQuestEventQueue();
          if (getQueuedQuestEventCount() === 0) {
            await abandonQuestSession(sessionId, accessToken);
          }
        } catch {
          // 화면 종료는 기록 전송 실패와 무관하게 진행한다.
        }
      })();
    }
    onBack();
  };

  const primaryAction = () => {
    if (!submittedChoice) submitChoice();
    else if (wrong) retryStep();
    else if (stepIndex === quest.steps.length - 1) void finishQuest();
    else moveToNextStep();
  };

  const buttonLabel = !submittedChoice
    ? '정답 확인'
    : wrong
      ? '다시 고르기'
      : stepIndex === quest.steps.length - 1
        ? '결과 보기'
        : '다음으로';

  if (showResult) {
    return <QuestResult correctCount={correctCount} onBack={closePractice} quest={quest} />;
  }

  if (variation.isPreparing) {
    return (
      <View style={styles.root}>
        <View style={[styles.frame, compact && styles.frameCompact]}>
          <View style={styles.topBar}>
            <PressScale accessibilityLabel="퀘스트 닫기" hitSlop={12} onPress={closePractice}>
              <Ionicons color={colors.ink} name="close" size={30} />
            </PressScale>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((stepIndex + 1) / quest.steps.length) * 100}%` }]} />
            </View>
            <Text style={styles.step}>{stepIndex + 1}/{quest.steps.length}</Text>
          </View>
          <View accessibilityLiveRegion="polite" style={styles.variationLoading}>
            <ActivityIndicator color={colors.mint} size="large" />
            <Text style={styles.variationLoadingTitle}>새로운 퀘스트를 만들고 있어요.</Text>
            <Text style={styles.variationLoadingDescription}>모든 단계와 선택지를 안전하게 확인하고 있어요.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.frame, compact && styles.frameCompact]}>
        <View style={styles.topBar}>
          <PressScale accessibilityLabel="퀘스트 닫기" hitSlop={12} onPress={closePractice}>
            <Ionicons color={colors.ink} name="close" size={30} />
          </PressScale>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((stepIndex + 1) / quest.steps.length) * 100}%` }]} />
          </View>
          <Text style={styles.step}>{stepIndex + 1}/{quest.steps.length}</Text>
        </View>

        {variation.source === 'ai' ? <Text style={styles.variationBadge}>AI 생성 퀘스트</Text> : null}
        <Text style={styles.title}>{step.instruction}</Text>
        <View style={[styles.scene, compact && styles.sceneCompact]}>
          <View style={styles.person}>
            <View style={styles.personHead} />
            <View style={styles.personBody} />
          </View>
          <View style={styles.speechTail} />
          <View style={styles.speech}>
            <Text style={styles.speechText}>{step.situation}</Text>
          </View>
          {submittedChoice ? (
            <View style={[styles.feedback, correct && styles.correctFeedback]}>
              <Text style={[styles.feedbackText, correct && styles.correctFeedbackText]}>{submittedChoice.feedback}</Text>
            </View>
          ) : null}
        </View>

        {step.hint ? (
          <PressScale accessibilityRole="button" onPress={() => setHintUsed(true)} style={styles.hintButton}>
            <Text style={styles.hintText}>{hintUsed ? step.hint : '힌트 보기'}</Text>
          </PressScale>
        ) : null}

        <View style={[styles.answers, compact && styles.answersCompact]}>
          {step.choices.map((choice) => {
            const active = selectedChoiceId === choice.id;
            return (
              <PressScale
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                disabled={correct}
                key={choice.id}
                onPress={() => {
                  setSelectedChoiceId(choice.id);
                  setSubmittedChoice(null);
                }}
                style={[styles.answer, compact && styles.answerCompact, active && styles.answerSelected]}
              >
                <Text style={styles.answerText}>{choice.label}</Text>
              </PressScale>
            );
          })}
        </View>

        {syncNotice ? <Text style={styles.syncNotice}>{syncNotice}</Text> : null}
        <PressScale
          accessibilityRole="button"
          disabled={selectedChoiceId === null}
          onPress={primaryAction}
          style={[styles.button, compact && styles.buttonCompact, selectedChoiceId === null && styles.disabled]}
        >
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </PressScale>
      </View>
    </View>
  );
}

function QuestResult({ correctCount, onBack, quest }: { correctCount: number; onBack: () => void; quest: QuestDetail }) {
  const iconProgress = useRef(new Animated.Value(0)).current;
  const copyProgress = useRef(new Animated.Value(0)).current;
  const summaryProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    const animations = [iconProgress, copyProgress, summaryProgress];
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted) return;
      if (reduceMotion) {
        animations.forEach((value) => value.setValue(1));
        return;
      }
      Animated.sequence([
        Animated.spring(iconProgress, { damping: 10, mass: 0.7, stiffness: 180, toValue: 1, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(copyProgress, { duration: 260, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
          Animated.spring(summaryProgress, { damping: 14, mass: 0.8, stiffness: 150, toValue: 1, useNativeDriver: true }),
        ]),
      ]).start();
    });
    return () => {
      mounted = false;
      animations.forEach((value) => value.stopAnimation());
    };
  }, [copyProgress, iconProgress, summaryProgress]);

  return (
    <View style={styles.resultRoot}>
      <View style={styles.resultFrame}>
        <View style={styles.resultTopBar}>
          <PressScale accessibilityLabel="결과 닫기" hitSlop={12} onPress={onBack}>
            <Ionicons color={colors.ink} name="close" size={30} />
          </PressScale>
        </View>
        <View style={styles.resultContent}>
          <Animated.View style={[styles.resultIcon, { opacity: iconProgress, transform: [{ scale: iconProgress }] }]}>
            <Ionicons color={colors.white} name="checkmark" size={42} />
          </Animated.View>
          <Animated.View style={{ opacity: copyProgress }}>
            <Text style={styles.resultTitle}>{quest.title} 연습을 마쳤어요!</Text>
            <Text style={styles.resultDescription}>{correctCount}개의 단계를 완료했어요.</Text>
          </Animated.View>
          <Animated.View style={[styles.resultSummary, { opacity: summaryProgress }]}>
            <View style={styles.resultSummaryRow}>
              <Text style={styles.resultSummaryLabel}>완료한 단계</Text>
              <Text style={styles.resultSummaryValue}>{quest.steps.length}개</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultSummaryRow}>
              <Text style={styles.resultSummaryLabel}>받은 경험치</Text>
              <Text style={styles.resultXp}>+{quest.rewardPoints} XP</Text>
            </View>
          </Animated.View>
        </View>
        <PressScale accessibilityRole="button" onPress={onBack} style={styles.resultButton}>
          <Text style={styles.buttonText}>퀘스트 목록으로</Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, flex: 1 },
  frame: { alignSelf: 'center', flex: 1, maxWidth: 680, paddingHorizontal: 20, width: '100%' },
  frameCompact: { paddingHorizontal: 16 },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12, height: 62 },
  progressTrack: { backgroundColor: '#DDDDDD', borderRadius: 8, flex: 1, height: 14, overflow: 'hidden' },
  progressFill: { backgroundColor: '#329F00', borderRadius: 8, height: 14 },
  step: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18 },
  title: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 20, marginBottom: 18, marginTop: 2 },
  variationBadge: { alignSelf: 'flex-start', backgroundColor: '#E9FFF2', borderRadius: 10, color: '#16875D', fontFamily: fonts.bold, fontSize: 11, marginBottom: 7, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4 },
  variationLoading: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 62 },
  variationLoadingTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18, marginTop: 16 },
  variationLoadingDescription: { color: '#777777', fontFamily: fonts.regular, fontSize: 13, marginTop: 7, textAlign: 'center' },
  scene: { backgroundColor: '#B3B3B3', borderRadius: 16, flex: 1, maxHeight: 238, minHeight: 190, overflow: 'hidden', position: 'relative' },
  sceneCompact: { minHeight: 170 },
  person: { bottom: 0, left: '9%', position: 'absolute' },
  personHead: { backgroundColor: '#D2D2D2', borderRadius: 16, height: 55, marginLeft: 10, width: 62 },
  personBody: { backgroundColor: '#D2D2D2', borderTopLeftRadius: 18, borderTopRightRadius: 18, height: 105, marginTop: 8, width: 82 },
  speech: { backgroundColor: colors.white, borderColor: '#D2D2D2', borderRadius: 11, borderWidth: 2, left: '37%', maxWidth: '58%', paddingHorizontal: 14, paddingVertical: 9, position: 'absolute', top: '30%' },
  speechTail: { borderBottomColor: 'transparent', borderBottomWidth: 10, borderRightColor: '#D2D2D2', borderRightWidth: 15, borderTopColor: 'transparent', borderTopWidth: 10, left: '33%', position: 'absolute', top: '43%' },
  speechText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  feedback: { alignSelf: 'center', backgroundColor: colors.white, borderRadius: 28, bottom: 12, left: 24, paddingHorizontal: 14, paddingVertical: 10, position: 'absolute', right: 24 },
  feedbackText: { color: '#F1801D', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, textAlign: 'center' },
  correctFeedback: { backgroundColor: '#EDFFF5' },
  correctFeedbackText: { color: '#16875D' },
  hintButton: { alignItems: 'center', backgroundColor: '#F4F8F5', borderRadius: 14, marginTop: 10, padding: 10 },
  hintText: { color: '#48725D', fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  answers: { gap: 11, marginTop: 14 },
  answersCompact: { gap: 8, marginTop: 10 },
  answer: { alignItems: 'center', borderColor: '#EEEEEE', borderRadius: 23, borderWidth: 3, justifyContent: 'center', minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  answerCompact: { minHeight: 48 },
  answerSelected: { backgroundColor: '#D3FFE5', borderColor: '#43DE84' },
  answerText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, textAlign: 'center' },
  syncNotice: { color: '#777777', fontFamily: fonts.regular, fontSize: 11, marginTop: 6, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, justifyContent: 'center', marginBottom: 18, marginTop: 14, minHeight: 58 },
  buttonCompact: { marginBottom: 8, marginTop: 10, minHeight: 50 },
  buttonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 17 },
  disabled: { opacity: 0.4 },
  loadingRoot: { alignItems: 'center', backgroundColor: colors.white, flex: 1, justifyContent: 'center', padding: 24 },
  loadingText: { color: '#777777', fontFamily: fonts.medium, marginTop: 12 },
  loadingBack: { backgroundColor: colors.mint, borderRadius: 18, marginTop: 20, paddingHorizontal: 20, paddingVertical: 14 },
  resultRoot: { backgroundColor: '#F8FBF9', flex: 1 },
  resultFrame: { alignSelf: 'center', flex: 1, maxWidth: 680, paddingHorizontal: 20, width: '100%' },
  resultTopBar: { height: 62, justifyContent: 'center' },
  resultContent: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 30 },
  resultIcon: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 38, height: 76, justifyContent: 'center', width: 76 },
  resultTitle: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 25, lineHeight: 32, marginTop: 20, textAlign: 'center' },
  resultDescription: { color: '#777777', fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  resultSummary: { backgroundColor: colors.white, borderColor: '#E8EEEA', borderRadius: 22, borderWidth: 1, marginTop: 28, paddingHorizontal: 16, width: '100%' },
  resultSummaryRow: { alignItems: 'center', flexDirection: 'row', minHeight: 66 },
  resultSummaryLabel: { color: '#555555', flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  resultSummaryValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  resultXp: { color: colors.mint, fontFamily: fonts.extraBold, fontSize: 18 },
  resultDivider: { backgroundColor: '#EEEEEE', height: 1 },
  resultButton: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, height: 60, justifyContent: 'center', marginBottom: 18 },
});
