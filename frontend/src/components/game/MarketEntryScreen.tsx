import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '../PressScale';
import { colors, fonts } from '../../theme';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { settingsColors } from './MarketSettingsUi';

const entryAssets = {
  cart: require('../../../assets/images/game/market/entry/shopping-cart-runtime.png'),
};

/** GameEntry1 (569:4649): original 375×812 frame, with room to scroll on short screens. */
export function MarketEntryScreen({ difficulty, requester, instructions, details, scenarioChip, startLabel = '도전 시작', onDifficultyChange, onStart, onHistory, onSettings, onExit }: {
  difficulty: 'family' | 'exact';
  instructions?: string;
  details?: React.ReactNode;
  /** 긴 정보 박스 대신 쓰는 짧은 시나리오 버튼(예: "S02 공원 간식"). 누르면 상세 창을 연다. */
  scenarioChip?: { label: string; onPress: () => void };
  startLabel?: string;
  requester?: string;
  onDifficultyChange: (difficulty: 'family' | 'exact') => void;
  onStart: () => void;
  onHistory: () => void;
  onSettings?: () => void;
  onExit: () => void;
}) {
  const dimensions = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const [size, setSize] = useState({ width: dimensions.width, height: dimensions.height });
  const reduced = useMarketReducedMotion();
  const arrival = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const boardHeight = Math.max(details ? 920 : 750, size.height);
  const bottom = Math.max(23, (insets?.bottom ?? 0) + 12);
  const baseline = boardHeight - (bottom - 23);

  useEffect(() => {
    arrival.stopAnimation();
    float.stopAnimation();
    float.setValue(0);
    if (reduced) { arrival.setValue(1); return; }
    const entrance = Animated.spring(arrival, {
      toValue: 1, damping: 19, stiffness: 125, mass: 0.8, useNativeDriver: true,
    });
    const drift = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -2, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    entrance.start(); drift.start();
    return () => { entrance.stop(); drift.stop(); };
  }, [arrival, float, reduced]);

  return <View
    testID="market-entry-screen"
    accessibilityViewIsModal
    onLayout={event => setSize(event.nativeEvent.layout)}
    style={s.root}
  >
    <View testID="market-entry-backdrop" pointerEvents="none" style={s.shade} />
    <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
      <View style={[s.board, { width: Math.min(375, size.width), height: boardHeight }]}>
        {scenarioChip ? <View style={s.chipSlot}><PressScale accessibilityRole="button" accessibilityLabel={`${scenarioChip.label}, 시나리오 자세히 보기`}
          onPress={scenarioChip.onPress} scaleTo={reduced ? 1 : 0.97} style={s.chip} testID="market-scenario-chip">
          <Text numberOfLines={1} style={s.chipText}>{scenarioChip.label}</Text>
          <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
        </PressScale></View> : null}
        {details ? <ScrollView nestedScrollEnabled style={{position:'absolute',left:24,right:24,top:24,maxHeight:180,backgroundColor:'#23352D99',borderRadius:18}} contentContainerStyle={{padding:12,gap:4,alignItems:'center'}}>{details}</ScrollView> : null}
        <Animated.View pointerEvents="none" style={[s.art, { top: baseline - 681, opacity: arrival, transform: [
          { translateY: float },
          { scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ] }]}>
          <Image testID="market-entry-cart" source={entryAssets.cart} resizeMode="cover" style={s.cart} accessible={false} />
        </Animated.View>
        <View style={[s.title, { top: baseline - 465 }]}>
          <EntryLabel text="장 보기" title />
        </View>
        <View style={[s.subtitle, { top: baseline - 425 }]}><EntryLabel text="생활 연습" muted /></View>
        <View style={[s.description, { top: baseline - 387 }]}><EntryLabel text={instructions ?? "목록을 보고 필요한 물건을 골라 보세요!"} /></View>
        {requester
          ? <View style={[s.requester, { top: baseline - 335 }]}><EntryLabel text={requester} /></View>
          : <View accessibilityRole="radiogroup" accessibilityLabel="장보기 모드" style={[s.modes, { top: baseline - 335 }]}>
            <View testID="market-mode-outline" pointerEvents="none" style={s.modeOutline} />
            <View testID="market-mode-indicator" pointerEvents="none" style={[s.modeIndicator, { left: difficulty === 'family' ? 6 : 106 }]} />
            <View style={s.modeOptions}>
            {(['family', 'exact'] as const).map(mode => <PressScale
              key={mode}
              accessibilityRole="radio"
              aria-checked={difficulty === mode}
              accessibilityLabel={mode === 'family' ? '연습 모드' : '도전 모드'}
              accessibilityState={{ checked: difficulty === mode }}
              onPress={() => onDifficultyChange(mode)}
              scaleTo={reduced ? 1 : 0.98}
              style={s.mode}
            ><Text style={[s.modeText, difficulty === mode && s.modeTextSelected]}>{mode === 'family' ? '연습 모드' : '도전 모드'}</Text></PressScale>)}
            </View>
          </View>}
        <View style={[s.actionSlot, { top: baseline - 249 }]}><EntryButton text={startLabel} label={startLabel === '다음' ? '다음' : '장보기 시작'} primary reduced={reduced} onPress={onStart} /></View>
        <View style={[s.actionSlot, { top: baseline - 189 }]}><EntryButton text="기록" label="이전 게임 기록" reduced={reduced} onPress={onHistory} /></View>
        <View style={[s.actionSlot, { top: baseline - 129 }]}><EntryButton text="그만두기" label="장보기 시작 화면 닫기" reduced={reduced} onPress={onExit} /></View>
        {onSettings ? <View style={[s.actionSlot, { top: baseline - 57 }]}><PressScale
          accessibilityRole="button" accessibilityLabel="마트 설정" onPress={onSettings} scaleTo={reduced ? 1 : 0.98} style={s.debug}
        ><Text style={s.debugText}>설정(디버그)</Text></PressScale></View> : null}
      </View>
    </ScrollView>
  </View>;
}

function EntryButton({ text, label, primary, reduced, onPress }: { text: string; label: string; primary?: boolean; reduced: boolean; onPress: () => void }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={reduced ? 1 : 0.98} style={[s.button, primary && s.primary]}>
    <Text style={[s.buttonText, primary && s.primaryText]}>{text}</Text>
  </PressScale>;
}

/** Native text outline, keeping only the foreground label in the accessibility tree. */
function EntryLabel({ text, title, muted }: { text: string; title?: boolean; muted?: boolean }) {
  const outline = title ? 3 : 1.6;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
  return <View style={s.labelBox}>
    {offsets.map(([x, y], index) => <Text key={index} aria-hidden importantForAccessibility="no-hide-descendants" style={[s.label, title && s.titleText, s.outline, { transform: [{ translateX: x * outline }, { translateY: y * outline }] }]}>{text}</Text>)}
    <Text accessibilityRole={title ? 'header' : undefined} style={[s.label, title && s.titleText, muted && s.muted]}>{text}</Text>
  </View>;
}

const s = StyleSheet.create({
  chipSlot: { alignItems: 'center', left: 24, position: 'absolute', right: 24, top: 28, zIndex: 5 },
  chip: { alignItems: 'center', backgroundColor: '#23352DB3', borderRadius: 20, flexDirection: 'row', gap: 4, maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 9 },
  chipText: { color: '#FFFFFF', flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15 },
  root: { ...StyleSheet.absoluteFill },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: settingsColors.backdrop },
  scroll: { flexGrow: 1, alignItems: 'center' },
  board: { position: 'relative' },
  art: { position: 'absolute', width: 215, height: 229, alignSelf: 'center', marginLeft: 6 },
  cart: { width: 215, height: 229, transform: [{ scaleX: -1 }] },
  title: { position: 'absolute', left: 33, right: 31, height: 36 },
  subtitle: { position: 'absolute', left: 33, right: 31, height: 22 },
  description: { position: 'absolute', left: 24, right: 22, minHeight: 22 },
  labelBox: { position: 'relative' },
  label: { fontFamily: fonts.cafe24Ssurround, fontSize: 15, lineHeight: 22, letterSpacing: -0.375, color: colors.white, textAlign: 'center' },
  titleText: { fontSize: 28, lineHeight: 36, letterSpacing: -0.7 },
  outline: { position: 'absolute', width: '100%', color: '#8B897A' },
  muted: { color: 'rgba(255,255,255,0.8)' },
  modes: { position: 'absolute', alignSelf: 'center', width: 212, height: 52 },
  modeOutline: { ...StyleSheet.absoluteFill, borderRadius: 26, borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' },
  modeIndicator: { position: 'absolute', top: 6, width: 100, height: 40, borderRadius: 20, backgroundColor: colors.white },
  modeOptions: { ...StyleSheet.absoluteFill, padding: 6, flexDirection: 'row', alignItems: 'center' },
  mode: { flex: 1, minWidth: 0, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontFamily: fonts.cafe24Ssurround, fontSize: 15, lineHeight: 28, letterSpacing: -0.375, color: colors.white },
  modeTextSelected: { color: '#555555' },
  requester: { position: 'absolute', left: 24, right: 24, minHeight: 50, justifyContent: 'center' },
  actionSlot: { position: 'absolute', width: '100%', alignItems: 'center' },
  button: { backgroundColor: colors.white, borderRadius: 24, paddingHorizontal: 42, height: 50, justifyContent: 'center', alignItems: 'center', ...Platform.select({
    web: { boxShadow: '0 4px 0 rgba(85,85,85,0.1)' },
    default: { shadowColor: '#555555', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 0, elevation: 1 },
  }) },
  primary: { backgroundColor: colors.mint, marginLeft: 2 },
  buttonText: { fontFamily: fonts.cafe24Ssurround, fontSize: 17, lineHeight: 22, color: '#555555' },
  primaryText: { color: colors.white },
  debug: { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24, width: 100, minHeight: 34, justifyContent: 'center', alignItems: 'center' },
  debugText: { fontFamily: fonts.extraBold, fontSize: 12, lineHeight: 14, color: colors.white },
});
