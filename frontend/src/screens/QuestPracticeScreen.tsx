import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { QuestSummary } from '../api/quest';
import { PressScale } from '../components/PressScale';
import { colors, fonts } from '../theme';

const questions = [
  {
    npc: '어서 오세요.\n어디까지 가세요?',
    answers: ['공공 도서관 가나요?', '떡볶이 먹으러 가요.', '잘 모르겠습니다.'],
    correct: 0,
  },
  {
    npc: '네? 그게 무슨\n말씀이신지...',
    answers: ['그쪽 건물 되게 커요!', '뭐가 커요?', '드림 시네마 있어요!'],
    correct: 2,
  },
];

export function QuestPracticeScreen({
  onBack,
  quest,
}: {
  onBack: () => void;
  quest?: QuestSummary | null;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const question = questions[questionIndex];
  const wrong = submitted && selected !== question.correct;
  const correct = submitted && selected === question.correct;

  const next = () => {
    if (selected === null) return;
    if (!submitted) {
      setSubmitted(true);
      if (selected === question.correct) setCorrectCount((count) => count + 1);
      return;
    }
    if (wrong) {
      setSelected(null);
      setSubmitted(false);
      return;
    }
    if (questionIndex === questions.length - 1) {
      setShowResult(true);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setSelected(null);
    setSubmitted(false);
  };

  const buttonLabel = !submitted
    ? '정답 확인'
    : wrong
      ? '다시 고르기'
      : questionIndex === questions.length - 1
        ? '결과 보기'
        : '다음으로';

  if (showResult) return <QuestResult correctCount={correctCount} onBack={onBack} quest={quest} />;

  return (
    <View style={styles.root}>
      <View style={[styles.frame, compact && styles.frameCompact]}>
        <View style={styles.topBar}>
          <PressScale accessibilityLabel="퀘스트 닫기" hitSlop={12} onPress={onBack}>
            <Ionicons color={colors.ink} name="close" size={30} />
          </PressScale>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((questionIndex + 1) / questions.length) * 100}%` }]} />
          </View>
          <Text style={styles.step}>{questionIndex + 1}/{questions.length}</Text>
        </View>

        <Text style={styles.title}>{quest ? `${quest.title} 연습` : '어떻게 말하면 좋을까요?'}</Text>
        <View style={[styles.scene, compact && styles.sceneCompact]}>
          <View style={styles.person}>
            <View style={styles.personHead} />
            <View style={styles.personBody} />
          </View>
          <View style={styles.speechTail} />
          <View style={styles.speech}>
            <Text style={styles.speechText}>{question.npc}</Text>
          </View>
          {wrong ? (
            <View style={styles.feedback}>
              <Text style={styles.feedbackText}>그렇게 말하면 위치를 찾기 어려우니{'\n'}다시 한 번 말해보세요.</Text>
            </View>
          ) : null}
          {correct ? (
            <View style={[styles.feedback, styles.correctFeedback]}>
              <Text style={[styles.feedbackText, styles.correctFeedbackText]}>좋아요! 상대방이 이해하기 쉬운 말이에요.</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.answers, compact && styles.answersCompact]}>
          {question.answers.map((answer, index) => {
            const active = selected === index;
            return (
              <PressScale
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                disabled={correct}
                key={answer}
                onPress={() => {
                  setSelected(index);
                  setSubmitted(false);
                }}
                style={[styles.answer, compact && styles.answerCompact, active && styles.answerSelected]}
              >
                <Text style={styles.answerText}>{answer}</Text>
              </PressScale>
            );
          })}
        </View>

        <PressScale
          accessibilityRole="button"
          disabled={selected === null}
          onPress={next}
          style={[styles.button, compact && styles.buttonCompact, selected === null && styles.disabled]}
        >
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </PressScale>
      </View>
    </View>
  );
}

function QuestResult({
  correctCount,
  onBack,
  quest,
}: {
  correctCount: number;
  onBack: () => void;
  quest?: QuestSummary | null;
}) {
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
        Animated.spring(iconProgress, {
          damping: 10,
          mass: 0.7,
          stiffness: 180,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(copyProgress, {
            duration: 260,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.spring(summaryProgress, {
            damping: 14,
            mass: 0.8,
            stiffness: 150,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });

    return () => {
      mounted = false;
      animations.forEach((value) => value.stopAnimation());
    };
  }, [copyProgress, iconProgress, summaryProgress]);

  const iconStyle = {
    opacity: iconProgress,
    transform: [
      {
        scale: iconProgress.interpolate({
          inputRange: [0, 0.65, 1],
          outputRange: [0.35, 1.14, 1],
        }),
      },
      {
        rotate: iconProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['-18deg', '0deg'],
        }),
      },
    ],
  };
  const copyStyle = {
    opacity: copyProgress,
    transform: [
      {
        translateY: copyProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };
  const summaryStyle = {
    opacity: summaryProgress,
    transform: [
      {
        scale: summaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
      {
        translateY: summaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.resultRoot}>
      <View style={styles.resultFrame}>
        <View style={styles.resultTopBar}>
          <PressScale accessibilityLabel="결과 닫기" hitSlop={12} onPress={onBack}>
            <Ionicons color={colors.ink} name="close" size={30} />
          </PressScale>
        </View>

        <View style={styles.resultContent}>
          <Animated.View style={[styles.resultIcon, iconStyle]}>
            <Ionicons color={colors.white} name="checkmark" size={42} />
          </Animated.View>
          <Animated.View style={copyStyle}>
            <Text style={styles.resultTitle}>{quest ? `${quest.title} 연습을 마쳤어요!` : '대화 연습을 마쳤어요!'}</Text>
            <Text style={styles.resultDescription}>
              {correctCount}개의 상황에서 알맞은 말을 골랐어요.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.resultSummary, summaryStyle]}>
            <View style={styles.resultSummaryRow}>
              <View style={styles.resultSummaryIcon}>
                <Ionicons color={colors.mint} name="chatbubble-ellipses" size={20} />
              </View>
              <Text style={styles.resultSummaryLabel}>완료한 대화</Text>
              <Text style={styles.resultSummaryValue}>{questions.length}개</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultSummaryRow}>
              <View style={[styles.resultSummaryIcon, styles.xpIcon]}>
                <Ionicons color="#F2AE00" name="star" size={20} />
              </View>
              <Text style={styles.resultSummaryLabel}>받은 경험치</Text>
              <Text style={styles.resultXp}>+{quest?.rewardPoints ?? 20} XP</Text>
            </View>
          </Animated.View>
        </View>

        <PressScale accessibilityRole="button" onPress={onBack} style={styles.resultButton}>
          <Text style={styles.resultButtonText}>퀘스트 목록으로</Text>
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
  progressFill: { backgroundColor: '#329F00', borderRadius: 8, height: 14, width: '75%' },
  step: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18 },
  title: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 20, marginBottom: 18, marginTop: 2 },
  scene: { backgroundColor: '#B3B3B3', borderRadius: 16, flex: 1, maxHeight: 238, minHeight: 190, overflow: 'hidden', position: 'relative' },
  sceneCompact: { minHeight: 170 },
  person: { bottom: 0, left: '9%', position: 'absolute' },
  personHead: { backgroundColor: '#D2D2D2', borderRadius: 16, height: 55, marginLeft: 10, width: 62 },
  personBody: { backgroundColor: '#D2D2D2', borderTopLeftRadius: 18, borderTopRightRadius: 18, height: 105, marginTop: 8, width: 82 },
  speech: { backgroundColor: colors.white, borderColor: '#D2D2D2', borderRadius: 11, borderWidth: 2, left: '41%', paddingHorizontal: 17, paddingVertical: 9, position: 'absolute', top: '37%' },
  speechTail: { borderBottomColor: 'transparent', borderBottomWidth: 10, borderRightColor: '#D2D2D2', borderRightWidth: 15, borderTopColor: 'transparent', borderTopWidth: 10, left: '37%', position: 'absolute', top: '46%' },
  speechText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 17, lineHeight: 23, textAlign: 'center' },
  feedback: { alignSelf: 'center', backgroundColor: colors.white, borderRadius: 28, bottom: 12, left: 36, paddingHorizontal: 14, paddingVertical: 10, position: 'absolute', right: 36 },
  feedbackText: { color: '#F1801D', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, textAlign: 'center' },
  correctFeedback: { backgroundColor: '#EDFFF5' },
  correctFeedbackText: { color: '#16875D' },
  answers: { gap: 11, marginTop: 24 },
  answersCompact: { gap: 8, marginTop: 14 },
  answer: { alignItems: 'center', borderColor: '#EEEEEE', borderRadius: 23, borderWidth: 3, height: 60, justifyContent: 'center' },
  answerCompact: { height: 50 },
  answerSelected: { backgroundColor: '#D3FFE5', borderColor: '#43DE84' },
  answerText: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  button: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, height: 62, justifyContent: 'center', marginBottom: 18, marginTop: 35 },
  buttonCompact: { height: 52, marginBottom: 8, marginTop: 14 },
  buttonText: { color: colors.white, fontFamily: fonts.laundry, fontSize: 17 },
  disabled: { opacity: 0.4 },
  resultRoot: { backgroundColor: '#F8FBF9', flex: 1 },
  resultFrame: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 680,
    paddingHorizontal: 20,
    width: '100%',
  },
  resultTopBar: { height: 62, justifyContent: 'center' },
  resultContent: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 30 },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 38,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  resultTitle: {
    color: colors.ink,
    fontFamily: fonts.laundryBold,
    fontSize: 25,
    letterSpacing: -0.7,
    lineHeight: 32,
    marginTop: 20,
    textAlign: 'center',
  },
  resultDescription: {
    color: '#777777',
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  resultSummary: {
    backgroundColor: colors.white,
    borderColor: '#E8EEEA',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 28,
    paddingHorizontal: 16,
    width: '100%',
  },
  resultSummaryRow: { alignItems: 'center', flexDirection: 'row', minHeight: 66 },
  resultSummaryIcon: {
    alignItems: 'center',
    backgroundColor: '#E8FAF2',
    borderRadius: 15,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  xpIcon: { backgroundColor: '#FFF7D9' },
  resultSummaryLabel: {
    color: '#555555',
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    marginLeft: 11,
  },
  resultSummaryValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  resultXp: { color: colors.mint, fontFamily: fonts.extraBold, fontSize: 18 },
  resultDivider: { backgroundColor: '#EEEEEE', height: 1 },
  resultButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 20,
    height: 60,
    justifyContent: 'center',
    marginBottom: 18,
  },
  resultButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 17 },
});
