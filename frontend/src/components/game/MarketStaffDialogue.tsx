import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { DIALOGUE_CHARACTER_DELAY, DIALOGUE_CHOICE_DURATION, DIALOGUE_ENTER_SPRING } from '../../game/dialogueFeedback';
import { MarketPanelActivityContext, useMarketReducedMotion } from './MarketPanelTransition';
import { useDialogueAudio } from './useDialogueAudio';

type MarketStaffDialogueProps = {
  name: string;
  message: string;
  response?: string;
  bottomInset?: number;
  children: ReactNode;
};

/** Matches village dialogue timing; retained closing panels stop work immediately. */
export function MarketStaffDialogue({
  name, message, response, bottomInset = 24, children,
}: MarketStaffDialogueProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const active = useContext(MarketPanelActivityContext);
  const reducedMotion = useMarketReducedMotion();
  const text = response || message;
  const turnKey = JSON.stringify([name, message, response ?? '']);
  const [shown, setShown] = useState({ key: turnKey, count: 0 });
  const count = shown.key === turnKey ? shown.count : 0;
  const complete = reducedMotion || count >= text.length;
  const typing = active && !complete;
  const audio = useDialogueAudio({ active: active && !reducedMotion, turnKey });
  const entrance = useRef(new Animated.Value(0)).current;
  const choiceProgress = useRef(new Animated.Value(0)).current;
  const tagFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    if (shown.key !== turnKey) {
      setShown({ key: turnKey, count: reducedMotion ? text.length : 0 });
      return;
    }
    if (reducedMotion) {
      if (count < text.length) setShown({ key: turnKey, count: text.length });
      return;
    }
    if (complete) return;
    const timer = setTimeout(() => {
      audio.playCharacter(text[count]);
      setShown({ key: turnKey, count: count + 1 });
    }, DIALOGUE_CHARACTER_DELAY);
    return () => clearTimeout(timer);
  }, [active, audio.playCharacter, complete, count, reducedMotion, shown.key, text, turnKey]);

  useEffect(() => {
    entrance.stopAnimation();
    if (!active) return;
    entrance.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.spring(entrance, { ...DIALOGUE_ENTER_SPRING, toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [active, entrance, reducedMotion, turnKey]);
  useEffect(() => {
    choiceProgress.stopAnimation();
    choiceProgress.setValue(active && complete && reducedMotion ? 1 : 0);
    if (!active || !complete || reducedMotion) return;
    const animation = Animated.timing(choiceProgress, {
      duration: DIALOGUE_CHOICE_DURATION, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, choiceProgress, complete, reducedMotion, turnKey]);
  useEffect(() => {
    tagFloat.setValue(0);
    if (!active || reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(tagFloat, { toValue: -2.25, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tagFloat, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => { animation.stop(); tagFloat.stopAnimation(); };
  }, [active, reducedMotion, tagFloat]);

  const skip = () => {
    if (!typing) return;
    audio.stop();
    setShown({ key: turnKey, count: text.length });
  };
  const visibleText = complete ? text : text.slice(0, count);
  return <View accessibilityViewIsModal style={[
    s.overlay,
    { paddingTop: Math.max(24, insets?.top ?? 0), paddingBottom: Math.max(bottomInset, insets?.bottom ?? 0) },
  ]} testID="market-staff-dialogue">
    <ScrollView style={s.scroll} contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled" scrollEnabled showsVerticalScrollIndicator={false}
      bounces={false} overScrollMode="never"
      testID="market-staff-dialogue-scroll">
      <Animated.View style={{ opacity: entrance, transform: [
        { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
      ] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="직원 대화 계속하기"
          accessibilityHint="누르면 문장을 한 번에 표시해요" accessibilityState={{ disabled: !typing }}
          disabled={!typing} onPress={skip} style={s.card} testID="market-staff-dialogue-card">
          <Animated.View pointerEvents="none" style={[s.nameTag, {
            transform: [{ rotate: '-4deg' }, { translateY: tagFloat }],
          }]}>
            <Text accessibilityRole="header" style={s.name}>{name}</Text>
          </Animated.View>
          <DialogueLine text={message} visibleText={response ? message : visibleText} complete={response ? true : complete} />
          {response ? <DialogueLine text={response} visibleText={visibleText} complete={complete} response /> : null}
          {typing ? <View pointerEvents="none" style={s.advanceIndicator} /> : null}
        </Pressable>
      </Animated.View>
      <Animated.View style={[s.choices, { opacity: choiceProgress, transform: [
        { translateY: choiceProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      ] }]} pointerEvents={active && complete ? 'auto' : 'none'}
        aria-hidden={!active || !complete}
        accessibilityElementsHidden={!active || !complete}
        importantForAccessibility={active && complete ? 'auto' : 'no-hide-descendants'}
        testID="market-staff-dialogue-choices">
        {children}
      </Animated.View>
    </ScrollView>
  </View>;
}

function DialogueLine({ text, visibleText, complete, response = false }: {
  text: string; visibleText: string; complete: boolean; response?: boolean;
}) {
  return <View style={response && s.response}>
    {/* Reserve line wrapping so the card and choices do not jump as letters appear. */}
    <Text aria-hidden accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[s.message, { opacity: 0 }]}>{text}</Text>
    <Text accessibilityLiveRegion={complete ? 'polite' : 'none'}
      style={[s.message, response && s.responseText, StyleSheet.absoluteFill]}
      testID={response ? 'market-staff-response-text' : 'market-staff-message-text'}>{visibleText}</Text>
  </View>;
}

export function MarketStaffDialogueChoice({ text, label, onPress }: {
  text: string;
  label?: string;
  onPress: () => void;
}) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label ?? text}
    onPress={onPress} style={s.choice}>
    <Text style={s.choiceText}>{text}</Text>
  </PressScale>;
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(49,50,46,0.15)',
  },
  scroll: { width: '89.333%', maxWidth: 335, maxHeight: '100%', flexGrow: 0 },
  content: { paddingTop: 22, paddingBottom: 4 },
  card: {
    minHeight: 128,
    borderRadius: 22,
    backgroundColor: 'rgba(75,75,75,0.90)',
    paddingHorizontal: 24,
    paddingTop: 29,
    paddingBottom: 22,
    justifyContent: 'center',
  },
  nameTag: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#D4C498',
    borderRadius: 18, minHeight: 34, minWidth: 71, maxWidth: '85%',
    left: 21, top: -18, position: 'absolute', paddingHorizontal: 14,
    transform: [{ rotate: '-4deg' }], zIndex: 3,
  },
  name: { color: '#333333', fontFamily: fonts.cafe24Ssurround, fontSize: 17, lineHeight: 23 },
  message: { color: '#FFFFFF', fontFamily: fonts.cafe24Ssurround, fontSize: 17, lineHeight: 27, textAlign: 'center' },
  response: { marginTop: 14 },
  responseText: { color: '#F7E8BB' },
  advanceIndicator: { position: 'absolute', right: 15, bottom: 12, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF' },
  choices: { alignItems: 'stretch', gap: 10, paddingTop: 14 },
  choice: {
    alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 25, minHeight: 50, justifyContent: 'center', maxWidth: '100%',
    // Village NPC pill width follows its text; longer/large-font labels may wrap.
    overflow: 'hidden', paddingHorizontal: 42, paddingVertical: 12,
  },
  choiceText: {
    color: '#333333', flexShrink: 1, fontFamily: fonts.cafe24Ssurround, fontSize: 17,
    lineHeight: 20, textAlign: 'center', transform: [{ translateY: 1 }],
  },
});
