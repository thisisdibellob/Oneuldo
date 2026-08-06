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

export function QuestPracticeScreen({ onBack }: { onBack: () => void }) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(1);
  const [submitted, setSubmitted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rewardOpacity = useRef(new Animated.Value(0)).current;
  const rewardY = useRef(new Animated.Value(18)).current;
  const rewardScale = useRef(new Animated.Value(0.82)).current;
  const question = questions[questionIndex];
  const wrong = submitted && selected !== question.correct;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const finishQuest = () => {
    if (completing) return;
    setCompleting(true);
    if (reduceMotion) {
      onBack();
      return;
    }

    rewardOpacity.setValue(0);
    rewardY.setValue(18);
    rewardScale.setValue(0.82);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(rewardOpacity, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.delay(220),
        Animated.timing(rewardOpacity, {
          duration: 360,
          easing: Easing.in(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(rewardY, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
        toValue: -58,
        useNativeDriver: true,
      }),
      Animated.spring(rewardScale, {
        damping: 13,
        mass: 0.55,
        stiffness: 220,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start(() => onBack());
  };

  const next = () => {
    if (selected === null || completing) return;
    if (!submitted) {
      setSubmitted(true);
      return;
    }
    if (questionIndex === questions.length - 1) {
      finishQuest();
      return;
    }
    setQuestionIndex(1);
    setSelected(2);
    setSubmitted(false);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.frame, compact && styles.frameCompact]}>
        <View style={styles.topBar}>
          <PressScale accessibilityLabel="퀘스트 닫기" hitSlop={12} onPress={onBack}>
            <Ionicons color={colors.ink} name="close" size={30} />
          </PressScale>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Text style={styles.step}>7/10</Text>
        </View>

        <Text style={styles.title}>어떻게 말하면 좋을까요?</Text>
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
        </View>

        <View style={[styles.answers, compact && styles.answersCompact]}>
          {question.answers.map((answer, index) => {
            const active = selected === index;
            return (
              <PressScale
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
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
          disabled={selected === null || completing}
          onPress={next}
          style={[styles.button, compact && styles.buttonCompact, (selected === null || completing) && styles.disabled]}
        >
          <Text style={styles.buttonText}>{completing ? '완료했어요!' : '이렇게 말할게요'}</Text>
        </PressScale>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.reward,
          {
            opacity: rewardOpacity,
            transform: [{ translateY: rewardY }, { scale: rewardScale }],
          },
        ]}
      >
        <Text style={styles.rewardText}>+20 XP</Text>
      </Animated.View>
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
  reward: { alignSelf: 'center', position: 'absolute', top: '48%', zIndex: 20 },
  rewardText: { color: '#33BB5B', fontFamily: fonts.extraBold, fontSize: 28, textShadowColor: 'rgba(255,255,255,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
});
